// packages/core/tests/grid-geometry-variable.test.ts
// Slice 1 of PRD 006: every geometry query under application-set row sizes,
// including the frozen band, the compressed last row and the revision
// (AC-006-01, AC-006-04, AC-006-05).

import { describe, expect, it } from "vitest";
import { createGridGeometry, type GridGeometryDeps } from "../src/geometry/grid-geometry";
import { createRowGeometry } from "../src/geometry/row-geometry";
import { getSuffixRowViewportTop, getSuffixWrapperOffset } from "../src/geometry/row-regions-mapping";
import type { PlacedRowSize } from "../src/geometry/override-axis";
import type { ColumnDefinition } from "../src/types/columns";

const PLACED: readonly PlacedRowSize[] = [
  { index: 2, size: 96 },
  { index: 10, size: 64 },
  { index: 500, size: 8.5 },
];

interface HarnessOptions {
  rowCount?: number;
  rowHeight?: number;
  placed?: readonly PlacedRowSize[];
  viewportHeight?: number;
  viewportWidth?: number;
  scrollTop?: number;
  ratio?: number;
  frozenCount?: number;
  overscan?: number;
}

const column = (id: string): ColumnDefinition =>
  ({ field: id, colId: id, cellDataType: "text", width: 200 }) as ColumnDefinition;

/** Extent of the size list the axis builds, without asking the geometry. */
const extentOf = (
  rowCount: number,
  rowHeight: number,
  placed: readonly PlacedRowSize[],
): number => rowCount * rowHeight + placed.reduce((sum, entry) => sum + entry.size - rowHeight, 0);

const createHarness = (options: HarnessOptions = {}) => {
  const rowCount = options.rowCount ?? 1000;
  const rowHeight = options.rowHeight ?? 32;
  // Stable references, as the column model and the placed-size provider keep
  // them: the layout resolver and the axis memo compare identity, not contents.
  const columns: readonly ColumnDefinition[] = [column("a"), column("b")];
  // A placed list is immutable and replaced on change; the harness mirrors
  // that so the geometry's identity memo sees the same contract as production.
  const placedRef = { current: options.placed ?? PLACED };
  let scrollTop = options.scrollTop ?? 0;
  const extent = (): number => extentOf(rowCount, rowHeight, placedRef.current);
  const viewportHeight = options.viewportHeight ?? 320;
  const ratio = options.ratio ?? 1;
  let frozenCount = options.frozenCount ?? 0;
  const deps: GridGeometryDeps = {
    getRowCount: () => rowCount,
    getRowHeight: () => rowHeight,
    getOverscan: () => options.overscan ?? 3,
    getColumnOverscan: () => 240,
    getColumns: () => columns,
    isWidthOverridden: () => false,
    getViewport: () => ({
      width: options.viewportWidth ?? 400,
      height: viewportHeight,
      scrollTop,
      scrollLeft: 0,
    }),
    getScrollMapping: () => ({
      getDomScrollTop: () => scrollTop,
      toDomScrollTop: (logical) => logical * ratio,
      toLogicalScrollTop: (dom) => (ratio < 1 ? dom / ratio : dom),
      isScalingActive: () => ratio < 1,
      getMaxLogicalScrollTop: () => Math.max(0, extent() - viewportHeight),
    }),
    getFrozenRowsRequest: () => ({ requestedCount: frozenCount }),
    getPlacedRowSizes: () => placedRef.current,
    createRowGeometry,
  };

  const geometry = createGridGeometry(deps, "fixed");
  return {
    geometry,
    setPlaced: (next: readonly PlacedRowSize[]) => {
      placedRef.current = next;
    },
    setScrollTop: (next: number) => {
      scrollTop = next;
    },
    setFrozenCount: (next: number) => {
      frozenCount = next;
    },
    expectedExtent: extent,
  };
};

const contentTopOf = (index: number): number =>
  index * 32 +
  PLACED.filter((entry) => entry.index < index).reduce((sum, entry) => sum + entry.size - 32, 0);

describe("GridGeometry — variable row sizes", () => {
  it("reports row and cell bounds in every space", () => {
    const { geometry } = createHarness({ placed: PLACED, scrollTop: 0 });
    geometry.refresh();
    expect(geometry.getContentSize().height).toBe(1000 * 32 + (96 - 32) + (64 - 32) + (8.5 - 32));

    for (const index of [0, 2, 3, 10, 500, 999]) {
      const expectedHeight = PLACED.find((entry) => entry.index === index)?.size ?? 32;
      const content = geometry.getRowBounds(index, "content");
      expect(content, `row ${index}`).toEqual({
        start: contentTopOf(index),
        end: contentTopOf(index) + expectedHeight,
      });
      expect(geometry.getRowBounds(index, "viewport"), `row ${index} viewport`).toEqual({
        start: contentTopOf(index) - 0,
        end: contentTopOf(index) + expectedHeight,
      });
      const cell = geometry.getCellBounds(index, 1, "content");
      expect(cell?.height, `cell ${index}`).toBe(expectedHeight);
      expect(cell?.top, `cell ${index}`).toBe(contentTopOf(index));
    }

    // Rows space equals content space without compression.
    expect(geometry.getRowBounds(10, "rows")).toEqual(geometry.getRowBounds(10, "content"));
  });

  it("hit-tests each placed row's edges and a fraction inside it", () => {
    const { geometry } = createHarness({ scrollTop: 0 });
    geometry.refresh();
    const rowAt = (y: number): number => geometry.hitTest({ x: 10, y }).row;
    // Row 2 spans 64..160 and row 10 spans 384..448.
    expect(rowAt(0)).toBe(0);
    expect(rowAt(63.9)).toBe(1);
    expect(rowAt(64)).toBe(2);
    expect(rowAt(120)).toBe(2);
    expect(rowAt(159.9)).toBe(2);
    expect(rowAt(160)).toBe(3);
    expect(rowAt(383.9)).toBe(9);
    expect(rowAt(384)).toBe(10);
    expect(rowAt(447.9)).toBe(10);
    expect(rowAt(448)).toBe(11);
  });

  it("answers the edge offsets of every boundary", () => {
    const { geometry } = createHarness({});
    geometry.refresh();
    for (let boundary = 0; boundary <= 1000; boundary++) {
      expect(geometry.getRowEdgeOffset(boundary, "content"), `edge ${boundary}`)
        .toBe(contentTopOf(boundary));
    }
    expect(geometry.getRowEdgeOffset(1001)).toBeUndefined();
  });

  it("keeps the frozen band exact and hit-tests across it", () => {
    const { geometry } = createHarness({ frozenCount: 3, placed: PLACED });
    geometry.refresh();
    // Rows 0, 1 and 2 are 32 + 32 + 96 tall.
    expect(geometry.getRowRegions().frozenExtent).toBe(160);
    expect(geometry.getRowClip(0)).toEqual({ start: 0, end: 160 });
    expect(geometry.getRowClip(2)).toEqual({ start: 0, end: 160 });
    expect(geometry.getRowClip(3)).toEqual({ start: 160, end: 320 });

    const rowAt = (y: number): { row: number; rowRegion: string | null } => {
      const hit = geometry.hitTest({ x: 10, y });
      return { row: hit.row, rowRegion: hit.rowRegion };
    };
    expect(rowAt(0)).toEqual({ row: 0, rowRegion: "frozen" });
    expect(rowAt(32)).toEqual({ row: 1, rowRegion: "frozen" });
    expect(rowAt(64)).toEqual({ row: 2, rowRegion: "frozen" });
    expect(rowAt(159.9)).toEqual({ row: 2, rowRegion: "frozen" });
    expect(rowAt(160)).toEqual({ row: 3, rowRegion: "suffix" });
    // The band wins over the scroll sample.
    const scrolled = createHarness({ frozenCount: 3, placed: PLACED, scrollTop: 5000 });
    scrolled.geometry.refresh();
    expect(scrolled.geometry.hitTest({ x: 10, y: 100 }).row).toBe(2);
  });
});

describe("GridGeometry — variable row sizes, scroll targets", () => {
  it("aligns the ends of a placed row", () => {
    const { geometry } = createHarness({ scrollTop: 0 });
    geometry.refresh();
    // Row 10 sits at 384..448, so its bottom is below the clip: the target
    // snaps up to row 5's start (160) rather than to the row's own start,
    // because the clip then holds the row's 64 px bottom inside its last row.
    expect(geometry.getScrollTarget(10, 0)).toEqual({ scrollTop: 160 });
    // Row 999 is below the clip: its bottom is 32,072.5, which snaps up to
    // the boundary after the wanted 31,752.5 (row 993 starts at 31,752.5,
    // one row past the 8.5 px row 992).
    expect(geometry.getScrollTarget(999, 0)).toEqual({ scrollTop: 31_752.5 });
    // Row 2 above the clip aligns to its start.
    expect(geometry.getScrollTarget(2, 0, { scrollTop: 400, scrollLeft: 0 })).toEqual({ scrollTop: 64 });
  });

  it("aligns a row taller than the body to its start", () => {
    const tall: readonly PlacedRowSize[] = [{ index: 500, size: 500 }];
    const { geometry } = createHarness({ placed: tall, viewportHeight: 320, scrollTop: 0 });
    geometry.refresh();
    const start = 500 * 32;
    expect(geometry.getScrollTarget(500, 0)).toEqual({ scrollTop: start });
    const aligned = createHarness({ placed: tall, viewportHeight: 320, scrollTop: start });
    aligned.geometry.refresh();
    expect(aligned.geometry.getScrollTarget(500, 0)).toEqual({});
  });

  it("never moves for a frozen row", () => {
    const { geometry } = createHarness({ frozenCount: 3, placed: PLACED });
    geometry.refresh();
    for (const scrollTop of [0, 5000]) {
      expect(geometry.getScrollTarget(0, 0, { scrollTop, scrollLeft: 0 }), `row 0 at ${scrollTop}`)
        .toEqual({});
      expect(geometry.getScrollTarget(2, 0, { scrollTop, scrollLeft: 0 }), `row 2 at ${scrollTop}`)
        .toEqual({});
    }
    // The first suffix row is at the clip top, and stays there when scrolled
    // away: a frozen band of 32 + 32 + 96 keeps it at content 160.
    expect(geometry.getScrollTarget(3, 0)).toEqual({});
    expect(geometry.getScrollTarget(3, 0, { scrollTop: 5000, scrollLeft: 0 })).toEqual({ scrollTop: 0 });
  });
});

describe("GridGeometry — variable row sizes, windows and compression", () => {
  it("never under-mounts the suffix clip around a placed row", () => {
    for (const scrollTop of [0, 60, 100, 300, 15_000]) {
      const { geometry } = createHarness({ scrollTop, placed: PLACED, overscan: 3 });
      geometry.refresh();
      const visible = geometry.getVisibleRowWindow();
      const window = geometry.getRowWindow();
      expect(window.start, `scroll ${scrollTop}`).toBeLessThanOrEqual(Math.max(visible.start - 3, 0));
      expect(window.end, `scroll ${scrollTop}`).toBeGreaterThanOrEqual(visible.end);
      for (let index = visible.start; index < visible.end; index++) {
        const bounds = geometry.getRowBounds(index, "viewport")!;
        expect(bounds.end, `row ${index} at ${scrollTop}`).toBeGreaterThan(0);
        expect(bounds.start, `row ${index} at ${scrollTop}`).toBeLessThan(320);
      }
    }
  });

  it("keeps the A7 invariant for suffix rows around a placed row", () => {
    const { geometry } = createHarness({
      rowCount: 10_000_000,
      scrollTop: 16_000,
      ratio: 0.01,
      placed: PLACED,
    });
    geometry.refresh();
    const frame = geometry.getRowGeometry();
    const region = frame.getRegionInput();
    const wrapperOffset = getSuffixWrapperOffset(region);
    const domTop = 16_000;
    const logicalTop = domTop / 0.01;
    const visible = geometry.getVisibleRowWindow();
    for (let index = visible.start; index < visible.end; index++) {
      const rowOffset = geometry.getRowBounds(index, "content")!.start;
      const rowPosition = frame.getRowRegionPosition(index);
      expect(
        wrapperOffset + rowPosition - domTop,
        `row ${index}`,
      ).toBeCloseTo(rowOffset - logicalTop, 6);
      expect(getSuffixRowViewportTop(region, index)).toBeCloseTo(rowOffset - logicalTop, 6);
    }
  });

  it("reveals the last row's bottom when it is taller than the body", () => {
    const rowCount = 10_000_000;
    const lastTop = (rowCount - 1) * 32;
    const last: readonly PlacedRowSize[] = [{ index: rowCount - 1, size: 480 }];
    const { geometry } = createHarness({ rowCount, scrollTop: 0, ratio: 0.01, placed: last });
    geometry.refresh();
    const extent = lastTop + 480;
    expect(geometry.getContentSize().height).toBe(extent);
    // The natural range ends inside the 480 px last row, so the reachable
    // maximum stays `extent − body` (D4) and the row's bottom is reachable.
    expect(geometry.getRowScrollRange().end).toBe(extent - 320);
    // Scrolled to the end, the body shows the tail of the row: its bottom is
    // on screen, 288 of its 480 px inside the clip, and the row is not scrolled
    // away. The last 32 px stay unreachable, which is the compressed mapping's
    // own arithmetical limit (D5 records the same bound for the anchor).
    const atEnd = createHarness({ rowCount, scrollTop: (extent - 320) * 0.01, ratio: 0.01, placed: last });
    atEnd.geometry.refresh();
    // At the reachable end the body shows the row's tail, its bottom on
    // screen, and the 480 px start alignment is overridden: the target may
    // only nudge the sample back inside the row, never scroll it away.
    const target = atEnd.geometry.getScrollTarget(rowCount - 1, 0).scrollTop;
    if (target !== undefined) {
      expect(target).toBeLessThan((extent - 320) * 0.01);
      expect((extent - 320) * 0.01 - target).toBeLessThan(32);
    }
    const row = atEnd.geometry.getRowBounds(rowCount - 1, "viewport")!;
    expect(row.start).toBeLessThan(0);
    expect(row.end).toBeGreaterThan(280);
    expect(row.end).toBeLessThanOrEqual(320);
  });

  it("advances the revision once when only the placed set changes", () => {
    const { geometry, setPlaced } = createHarness({ placed: [] });
    geometry.refresh();
    const before = geometry.revision;

    // Outside the mounted window (rows 0..12 here), so no slot or window work
    // can account for the change: the axis identity is what the revision reports.
    setPlaced([{ index: 500, size: 64 }]);
    geometry.refresh();
    const placedRevision = geometry.revision;
    expect(geometry.getRowWindow()).toEqual({ start: 0, end: 13 });
    expect(placedRevision).toBeGreaterThan(before);

    // The same placed array again is not a change.
    geometry.refresh();
    expect(geometry.revision).toBe(placedRevision);
  });
});
