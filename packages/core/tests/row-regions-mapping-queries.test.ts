import { describe, expect, it } from "vitest";
import { createSeedColumnLayout } from "../src/geometry/column-layout";
import { createPrefixAxis } from "../src/geometry/prefix-axis";
import { createRowMapper, type RowMapper } from "../src/geometry/row-mapping";
import {
  getRowClip,
  getRowRegionPosition,
  getSuffixViewportHeight,
  getSuffixWindow,
  getSuffixWrapperOffset,
  hitTestRowRegion,
  resolveRegionScrollCorrection,
  resolveRowRegionScrollTop,
} from "../src/geometry/row-regions-mapping";
import { resolveScrollTarget } from "../src/geometry/scroll-target";
import type { DisplayedColumn } from "../src/types/geometry";
import { createHarness, frameInput, type HarnessOptions } from "./row-regions-harness";

describe("row region parity and queries", () => {
  it("equals today's RowMapper and scroll target output with count 0", () => {
    const probe: DisplayedColumn = {
      columnId: "col",
      layoutIndex: 0,
      column: { field: "col", cellDataType: "text", width: 100 },
      offset: 0,
      width: 100,
    };
    const layout = createSeedColumnLayout([], "fixed", 500);
    const fixtures: HarnessOptions[] = [
      { rowCount: 1000, rowHeight: 32, viewportHeight: 320, domScrollTop: 0 },
      { rowCount: 1000, rowHeight: 32, viewportHeight: 320, domScrollTop: 5000 },
      { rowCount: 1_000_000, rowHeight: 32, viewportHeight: 320, domScrollTop: 320, ratio: 0.01 },
      { rowCount: 1_000_000, rowHeight: 32, viewportHeight: 320, domScrollTop: 123.5, ratio: 0.01 },
    ];
    for (const fixture of fixtures) {
      const harness = createHarness(fixture);
      const input = frameInput(harness, { frozenCount: 0, overscan: harness.overscan });
      expect(getSuffixWindow(input)).toEqual(harness.rows.getWindow());
      expect(getSuffixWrapperOffset(input)).toBe(harness.rows.getRowsWrapperOffset());
      for (const rowIndex of [0, 3, 40, harness.rowCount - 1]) {
        expect(getRowRegionPosition(input, rowIndex)).toBe(harness.rows.getRowRegionPosition(rowIndex));
        const today = resolveScrollTarget({
          axis: harness.axis,
          mapper: harness.mapper,
          layout,
          column: probe,
          region: "start",
          centerClip: { start: 0, end: 0 },
          viewIndex: rowIndex,
          rowHeight: harness.rowHeight,
          viewport: { width: 500, height: harness.viewportHeight },
          from: { scrollTop: harness.domScrollTop, scrollLeft: 0 },
        }).scrollTop;
        expect(resolveRowRegionScrollTop({ ...input, rowHeight: harness.rowHeight }, rowIndex)).toBe(today);
      }
    }
  });

  it("hit-tests the frozen band before scroll and keeps sentinels region-less", () => {
    const harness = createHarness({ rowCount: 1000, rowHeight: 32, viewportHeight: 320, domScrollTop: 1000 });
    const input = frameInput(harness, { frozenCount: 3 });
    expect(hitTestRowRegion(input, -1)).toEqual({ rowIndex: -1, rowRegion: null });
    const frozenEdges: Array<[number, number]> = [[0, 0], [31, 0], [32, 1], [95, 2]];
    for (const [y, rowIndex] of frozenEdges) {
      expect(hitTestRowRegion(input, y)).toEqual({ rowIndex, rowRegion: "frozen" });
    }
    const scrolled = frameInput(createHarness({
      rowCount: 1000,
      rowHeight: 32,
      viewportHeight: 320,
      domScrollTop: 20_000,
    }), { frozenCount: 3 });
    expect(hitTestRowRegion(scrolled, 40)).toEqual({ rowIndex: 1, rowRegion: "frozen" });
    expect(hitTestRowRegion(input, 96)).toEqual({ rowIndex: 34, rowRegion: "suffix" });
    expect(hitTestRowRegion(input, 40_000).rowRegion).toBeNull();
    expect(hitTestRowRegion(input, 40_000).rowIndex).toBe(1000);

    const flat = frameInput(harness, { frozenCount: 0 });
    const todayRow = (y: number): number => harness.axis.indexAt(y + 1000);
    for (const y of [-1, 0, 31, 96, 320]) {
      const expected = todayRow(y);
      expect(hitTestRowRegion(flat, y)).toEqual({
        rowIndex: expected,
        rowRegion: expected < 0 || expected >= 1000 ? null : "suffix",
      });
    }
  });

  it("returns the clip of the row's region", () => {
    const harness = createHarness({ rowCount: 1000, rowHeight: 32, viewportHeight: 320 });
    const input = frameInput(harness, { frozenCount: 3 });
    expect(getRowClip(input, 0)).toEqual({ start: 0, end: 96 });
    expect(getRowClip(input, 2)).toEqual({ start: 0, end: 96 });
    expect(getRowClip(input, 3)).toEqual({ start: 96, end: 320 });
    expect(getRowClip(input, 999)).toEqual({ start: 96, end: 320 });
    expect(getRowClip(input, -1)).toBeUndefined();
    expect(getRowClip(input, 1000)).toBeUndefined();
    expect(getRowClip(input, 1.5)).toBeUndefined();
    expect(getRowClip(frameInput(harness, { frozenCount: 0 }), 5)).toEqual({ start: 0, end: 320 });
  });

  it("resolves C6 targets and keeps a zero viewport concrete", () => {
    const harness = createHarness({ rowCount: 1000, rowHeight: 32, viewportHeight: 320, domScrollTop: 1000 });
    const input = { ...frameInput(harness, { frozenCount: 3 }), rowHeight: 32 };
    expect(resolveRowRegionScrollTop(input, 0)).toBeUndefined();
    expect(resolveRowRegionScrollTop(input, 2)).toBeUndefined();
    expect(resolveRowRegionScrollTop(input, 5)).toBe(64);
    expect(resolveRowRegionScrollTop(input, 33)).toBe(960);
    expect(resolveRowRegionScrollTop(input, 35)).toBeUndefined();
    expect(resolveRowRegionScrollTop(input, 60)).toBe(1632);
    expect(resolveRowRegionScrollTop(input, 1000)).toBeUndefined();

    const tall = createHarness({ rowCount: 100, rowHeight: 400, viewportHeight: 320, domScrollTop: 0 });
    const tallInput = { ...frameInput(tall, { frozenCount: 3 }), rowHeight: 400 };
    expect(resolveRowRegionScrollTop(tallInput, 5)).toBe(800);
    expect(resolveRowRegionScrollTop(tallInput, 0)).toBeUndefined();
    const aligned = createHarness({ rowCount: 100, rowHeight: 400, viewportHeight: 320, domScrollTop: 800 });
    expect(resolveRowRegionScrollTop({ ...frameInput(aligned, { frozenCount: 3 }), rowHeight: 400 }, 5))
      .toBeUndefined();

    const zero = createHarness({ rowCount: 100, rowHeight: 32, viewportHeight: 0, domScrollTop: 0 });
    const zeroInput = { ...frameInput(zero, { frozenCount: 3, viewportHeight: 0 }), rowHeight: 32 };
    expect(getSuffixWindow(zeroInput)).toEqual({ start: 3, end: 3 });
    expect(getSuffixViewportHeight(zeroInput)).toBe(0);
    expect(getRowClip(zeroInput, 0)).toEqual({ start: 0, end: 96 });
    expect(getRowClip(zeroInput, 3)).toEqual({ start: 96, end: 0 });
    expect(resolveRowRegionScrollTop(zeroInput, 0)).toBeUndefined();
    expect(resolveRowRegionScrollTop(zeroInput, 3)).toBeUndefined();
    expect(resolveRowRegionScrollTop(zeroInput, 50)).toBe(1504);
    expect(resolveRowRegionScrollTop(zeroInput, 99)).toBe(3072);
  });
});

describe("resolveRegionScrollCorrection", () => {
  const prefixMapper = (
    sizes: readonly number[],
    domScrollTop: number,
    viewportHeight: number,
  ): RowMapper => {
    const axis = createPrefixAxis(sizes);
    return createRowMapper(
      {
        mapping: {
          getDomScrollTop: () => domScrollTop,
          toDomScrollTop: (logical) => logical,
          toLogicalScrollTop: (dom) => dom,
          isScalingActive: () => false,
          getMaxLogicalScrollTop: () => Math.max(0, axis.extent - viewportHeight),
        },
      },
    );
  };

  const scrollAt = (domScrollTop: number): RowMapper =>
    createHarness({
      rowCount: 1000,
      rowHeight: 32,
      viewportHeight: 320,
      domScrollTop,
    }).mapper;

  it("corrects only a growing block and clamps at the logical top", () => {
    expect(resolveRegionScrollCorrection({
      mapper: scrollAt(200),
      frozenExtent: 96,
      previousFrozenExtent: 96,
    })).toBeNull();
    expect(resolveRegionScrollCorrection({
      mapper: scrollAt(200),
      frozenExtent: 64,
      previousFrozenExtent: 96,
    })).toBeNull();
    expect(resolveRegionScrollCorrection({
      mapper: scrollAt(0),
      frozenExtent: 64,
      previousFrozenExtent: 0,
    })).toBeNull();

    // max(0, L − Δ) for L > Δ, L = Δ and L < Δ.
    expect(resolveRegionScrollCorrection({
      mapper: scrollAt(200),
      frozenExtent: 96,
      previousFrozenExtent: 32,
    })).toBe(136);
    expect(resolveRegionScrollCorrection({
      mapper: scrollAt(64),
      frozenExtent: 96,
      previousFrozenExtent: 32,
    })).toBe(0);
    expect(resolveRegionScrollCorrection({
      mapper: scrollAt(32),
      frozenExtent: 96,
      previousFrozenExtent: 32,
    })).toBe(0);
  });

  it("anchors the clip on the same row when the block grows", () => {
    const harness = createHarness({
      rowCount: 1_000_000,
      rowHeight: 32,
      viewportHeight: 320,
      domScrollTop: 5000,
    });
    const previousFrozenExtent = 64;
    const frozenExtent = 96;
    const delta = frozenExtent - previousFrozenExtent;
    const logicalTop = harness.mapper.getLogicalScrollTop();
    const corrected = resolveRegionScrollCorrection({
      mapper: harness.mapper,
      frozenExtent,
      previousFrozenExtent,
    });

    expect(corrected).toBe(logicalTop - delta);
    expect(harness.mapper.toLogicalScrollTop(corrected!)).toBe(logicalTop - delta);
    expect(harness.axis.indexAt(logicalTop - delta + frozenExtent))
      .toBe(harness.axis.indexAt(logicalTop + previousFrozenExtent));
  });

  it("scales the corrected top through the compressed mapping", () => {
    const { mapper } = createHarness({
      rowCount: 1_000_000,
      rowHeight: 32,
      viewportHeight: 320,
      domScrollTop: 4,
      ratio: 0.01,
    });
    const corrected = resolveRegionScrollCorrection({
      mapper,
      frozenExtent: 96,
      previousFrozenExtent: 32,
    });

    expect(mapper.getLogicalScrollTop()).toBe(400);
    expect(corrected).toBe(mapper.toDomScrollTopClamped(336));
    expect(corrected).toBeLessThan(4);
    expect(corrected!).toBeLessThanOrEqual(
      mapper.toDomScrollTopClamped(mapper.getMaxLogicalScrollTop()),
    );
  });

  it("resolves extents over a prefix axis with unequal row sizes", () => {
    // Extent 192 with a 64 px body: the reachable top is 128.
    const sizes = [40, 8, 40, 8, 40, 8, 40, 8];
    expect(resolveRegionScrollCorrection({
      mapper: prefixMapper(sizes, 100, 64),
      frozenExtent: 48,
      previousFrozenExtent: 40,
    })).toBe(92);

    const beyond = prefixMapper(sizes, 200, 64);
    expect(resolveRegionScrollCorrection({
      mapper: beyond,
      frozenExtent: 100,
      previousFrozenExtent: 0,
    })).toBe(100);
    expect(resolveRegionScrollCorrection({
      mapper: beyond,
      frozenExtent: 40,
      previousFrozenExtent: 0,
    })).toBeNull();
  });
});
