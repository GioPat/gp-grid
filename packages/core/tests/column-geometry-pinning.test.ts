// packages/core/tests/column-geometry-pinning.test.ts

import { describe, expect, it } from "vitest";
import { createGridGeometry, type GridGeometryDeps } from "../src/geometry/grid-geometry";
import { createRowGeometry } from "../src/geometry/row-geometry";
import type { ColumnDefinition } from "../src/types/columns";
import type { ColumnPin } from "../src/types/geometry";

interface HarnessOptions {
  columns?: ColumnDefinition[];
  pins?: Record<string, ColumnPin>;
  viewportWidth?: number;
  scrollLeft?: number;
}

const column = (id: string, width: number): ColumnDefinition =>
  ({ field: id, colId: id, cellDataType: "text", width }) as ColumnDefinition;

const createHarness = (options: HarnessOptions = {}) => {
  const pins = options.pins ?? {};
  // The resolved definition carries the effective pin; both the partition and
  // admission read it from there.
  const columns = (options.columns ?? [
    column("a", 200),
    column("b", 300),
    column("c", 100),
    column("z", 150),
  ]).map((definition) => {
    const columnId = definition.colId ?? definition.field;
    return { ...definition, pinned: pins[columnId] };
  });
  let viewport = {
    width: options.viewportWidth ?? 500,
    scrollLeft: options.scrollLeft ?? 0,
  };

  const deps: GridGeometryDeps = {
    getRowCount: () => 100,
    getRowHeight: () => 32,
    getOverscan: () => 3,
    getColumnOverscan: () => 240,
    getColumns: () => columns,
    isWidthOverridden: () => false,
    getViewport: () => ({ width: viewport.width, height: 320, scrollTop: 0, scrollLeft: viewport.scrollLeft }),
    getScrollMapping: () => ({
      getDomScrollTop: () => 0,
      toDomScrollTop: (logical) => logical,
      toLogicalScrollTop: (dom) => dom,
      isScalingActive: () => false,
      getMaxLogicalScrollTop: () => 10_000,
    }),
    createRowGeometry,
  };

  const geometry = createGridGeometry(deps, "fixed");
  geometry.refresh();
  return {
    geometry,
    setViewport: (next: Partial<typeof viewport>) => {
      viewport = { ...viewport, ...next };
      geometry.refresh();
    },
  };
};

describe("ColumnGeometry — regions", () => {
  it("maps pinned columns to fixed viewport positions and center columns by scroll", () => {
    const harness = createHarness({ pins: { a: "start", z: "end" }, viewportWidth: 500 });

    expect(harness.geometry.getColumnBounds(0, "viewport")).toEqual({ start: 0, end: 200 });
    expect(harness.geometry.getColumnBounds(3, "viewport")).toEqual({ start: 350, end: 500 });
    expect(harness.geometry.getColumnBounds(1, "viewport")).toEqual({ start: 200, end: 500 });

    harness.setViewport({ scrollLeft: 40 });
    expect(harness.geometry.getColumnBounds(0, "viewport")).toEqual({ start: 0, end: 200 });
    expect(harness.geometry.getColumnBounds(3, "viewport")).toEqual({ start: 350, end: 500 });
    expect(harness.geometry.getColumnBounds(1, "viewport")).toEqual({ start: 160, end: 460 });
  });

  it("round-trips viewport and content x per region", () => {
    const harness = createHarness({ pins: { a: "start", z: "end" }, viewportWidth: 500, scrollLeft: 40 });

    // A start pin's viewport x equals its content x; both stay fixed.
    const startContent = harness.geometry.getColumnBounds(0, "content")!;
    const startViewport = harness.geometry.getColumnBounds(0, "viewport")!;
    expect(startViewport).toEqual(startContent);
    expect(harness.geometry.hitTest({ x: startViewport.start + 1, y: 10, scrollLeft: 40 })).toMatchObject({
      col: 0,
      region: "start",
    });

    // An end pin keeps its viewport slot even though its content x is far right.
    const endViewport = harness.geometry.getColumnBounds(3, "viewport")!;
    expect(endViewport).toEqual({ start: 350, end: 500 });
    expect(harness.geometry.hitTest({ x: endViewport.start + 1, y: 10, scrollLeft: 40 })).toMatchObject({
      col: 3,
      region: "end",
    });

    // A center column shifts by the scroll sample: column "b" stays reachable
    // inside the part of it the start pin does not cover.
    const center = harness.geometry.getColumnBounds(1, "viewport")!;
    expect(center).toEqual({ start: 160, end: 460 });
    expect(harness.geometry.hitTest({ x: 240, y: 10, scrollLeft: 40 })).toMatchObject({
      col: 1,
      region: "center",
    });
  });

  it("resolves hit tests at every region edge", () => {
    const harness = createHarness({ pins: { a: "start", z: "end" }, viewportWidth: 500 });

    expect(harness.geometry.hitTest({ x: 199, y: 0 })).toMatchObject({ col: 0, region: "start" });
    expect(harness.geometry.hitTest({ x: 200, y: 0 })).toMatchObject({ col: 1, region: "center" });
    // The end region owns the viewport edge; the center clip ends at 350.
    expect(harness.geometry.hitTest({ x: 349, y: 0 })).toMatchObject({ col: 1, region: "center" });
    expect(harness.geometry.hitTest({ x: 350, y: 0 })).toMatchObject({ col: 3, region: "end" });
    expect(harness.geometry.hitTest({ x: 499, y: 0 })).toMatchObject({ col: 3, region: "end" });
    expect(harness.geometry.hitTest({ x: 600, y: 0 })).toMatchObject({ col: -1, region: null });
    expect(harness.geometry.hitTest({ x: -1, y: 0 })).toMatchObject({ col: -1, region: null });
  });

  it("reports a region clip for each column", () => {
    const harness = createHarness({ pins: { a: "start", z: "end" }, viewportWidth: 500, scrollLeft: 40 });
    expect(harness.geometry.getColumnClip(0)).toEqual({ start: 0, end: 200 });
    expect(harness.geometry.getColumnClip(3)).toEqual({ start: 350, end: 500 });
    expect(harness.geometry.getColumnClip(1)).toEqual({ start: 200, end: 350 });
    expect(harness.geometry.getColumnClip(99)).toBeUndefined();
  });

  it("never needs horizontal movement for an admitted pin", () => {
    const harness = createHarness({ pins: { a: "start", z: "end" }, viewportWidth: 500, scrollLeft: 300 });
    expect(harness.geometry.getScrollTarget(5, 0)).toEqual({});
    expect(harness.geometry.getScrollTarget(5, 3)).toEqual({});
  });

  it("aligns a center column inside the center clip under pins", () => {
    const harness = createHarness({ pins: { a: "start", z: "end" }, viewportWidth: 500, scrollLeft: 0 });
    // Column c (300..400 content) is hidden behind the start pin until the
    // center scrolls: the clip in content space is [200, 350), so its right
    // edge must reach the end pin's viewport edge.
    expect(harness.geometry.getScrollTarget(5, 2)).toEqual({ scrollLeft: 250 });
  });

  it("omits the horizontal axis when the center clip is zero", () => {
    const harness = createHarness({ pins: { a: "start", b: "end" }, viewportWidth: 500, scrollLeft: 0 });
    expect(harness.geometry.getColumnLayout().regions.centerViewportWidth).toBe(0);
    expect(harness.geometry.getColumnWindow().center).toEqual([]);
    expect(harness.geometry.getScrollTarget(5, 2)).toEqual({});
  });

  it("keeps finite bounds when every column is pinned and the center is empty", () => {
    const harness = createHarness({
      columns: [column("a", 500), column("z", 500)],
      pins: { a: "start", z: "end" },
      viewportWidth: 500,
    });
    const layout = harness.geometry.getColumnLayout();
    expect(Number.isFinite(layout.totalWidth)).toBe(true);
    expect(layout.regions.centerViewportWidth).toBe(0);
    expect(harness.geometry.getColumnWindow()).toMatchObject({ range: { start: 0, end: 0 } });
  });

  it("rejects an over-wide pin into the scrolling center", () => {
    const harness = createHarness({
      columns: [column("wide", 900), column("b", 100), column("c", 100)],
      pins: { wide: "start" },
      viewportWidth: 300,
    });
    const layout = harness.geometry.getColumnLayout();
    expect(layout.regions.startWidth).toBe(0);
    expect(layout.columns[0]!.region).toBe("center");
    expect(harness.geometry.getColumnBounds(0, "viewport")).toEqual({ start: 0, end: 900 });
  });
});
