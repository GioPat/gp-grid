import { describe, expect, it } from "vitest";
import { createGridGeometry, type GridGeometryDeps } from "../src/geometry/grid-geometry";
import { createRowGeometry } from "../src/geometry/row-geometry";
import type { ColumnDefinition } from "../src/types/columns";
import type { ColumnLayoutMode, ColumnPin } from "../src/types/geometry";

interface HarnessOptions {
  rowCount?: number;
  rowHeight?: number;
  columns?: ColumnDefinition[];
  viewportWidth?: number;
  viewportHeight?: number;
  scrollTop?: number;
  scrollLeft?: number;
  overscan?: number;
  columnOverscan?: number;
  mode?: ColumnLayoutMode;
  overridden?: number[];
  pins?: Record<string, ColumnPin>;
  mapping?: { ratio?: number; override?: number | null };
  frozenCount?: number;
}

interface Harness {
  geometry: ReturnType<typeof createGridGeometry>;
  deps: GridGeometryDeps;
  setRowCount: (count: number) => void;
  setViewport: (sample: { width?: number; height?: number; scrollTop?: number; scrollLeft?: number }) => void;
  setColumns: (columns: ColumnDefinition[]) => void;
  setOverridden: (indices: number[]) => void;
  setFrozenCount: (count: number) => void;
}

const column = (id: string, width: number, hidden = false): ColumnDefinition =>
  ({ field: id, colId: id, cellDataType: "text", width, hidden }) as ColumnDefinition;

const twoColumns = (): ColumnDefinition[] => [column("a", 100), column("b", 100)];

const createHarness = (options: HarnessOptions = {}): Harness => {
  let rowCount = options.rowCount ?? 100;
  const rowHeight = options.rowHeight ?? 32;
  let viewport = {
    width: options.viewportWidth ?? 400,
    height: options.viewportHeight ?? 320,
    scrollTop: options.scrollTop ?? 0,
    scrollLeft: options.scrollLeft ?? 0,
  };
  let columns = options.columns ?? twoColumns();
  let overridden = options.overridden ?? [];
  let override: number | null = options.mapping?.override ?? null;
  let frozenCount = options.frozenCount ?? 0;
  const ratio = options.mapping?.ratio ?? 1;

  const deps: GridGeometryDeps = {
    getRowCount: () => rowCount,
    getRowHeight: () => rowHeight,
    getOverscan: () => options.overscan ?? 3,
    getColumnOverscan: () => options.columnOverscan ?? 240,
    getColumns: () => columns,
    isWidthOverridden: (layoutIndex) => overridden.includes(layoutIndex),
    getFrozenRowsRequest: () => ({ requestedCount: frozenCount }),
    getViewport: () => ({
      width: viewport.width,
      height: viewport.height,
      scrollTop: override ?? viewport.scrollTop,
      scrollLeft: viewport.scrollLeft,
    }),
    getScrollMapping: () => ({
      getDomScrollTop: () => override ?? viewport.scrollTop,
      toDomScrollTop: (logical) => logical * ratio,
      toLogicalScrollTop: (dom) => (ratio < 1 ? dom / ratio : dom),
      isScalingActive: () => ratio < 1,
      getMaxLogicalScrollTop: () => Math.max(0, rowCount * rowHeight - viewport.height),
    }),
    createRowGeometry,
  };

  return {
    geometry: createGridGeometry(deps, options.mode ?? "fit"),
    deps,
    setRowCount: (count) => {
      rowCount = count;
    },
    setViewport: (sample) => {
      viewport = { ...viewport, ...sample };
    },
    setColumns: (next) => {
      columns = next;
    },
    setOverridden: (indices) => {
      overridden = indices;
      // Mirrors the column model: any state change yields a new layout array.
      columns = [...columns];
    },
    setFrozenCount: (count) => {
      frozenCount = count;
    },
  };
};

describe("GridGeometry — columns", () => {
  it("publishes fitted widths and offsets", () => {
    const harness = createHarness({ viewportWidth: 400 });
    const layout = harness.geometry.getColumnLayout();
    expect(layout.mode).toBe("fit");
    expect(layout.totalWidth).toBe(400);
    expect(layout.columns.map((c) => [c.columnId, c.layoutIndex, c.offset, c.width])).toEqual([
      ["a", 0, 0, 200],
      ["b", 1, 200, 200],
    ]);
  });

  it("resolves bounds in every coordinate space, 0 for a hidden column", () => {
    const harness = createHarness({
      columns: [column("a", 200), column("b", 200)],
      mode: "fixed",
      viewportWidth: 300,
      scrollLeft: 50,
    });
    harness.geometry.refresh();
    expect(harness.geometry.getColumnBounds(0, "content")).toEqual({ start: 0, end: 200 });
    expect(harness.geometry.getColumnBounds(0, "viewport")).toEqual({ start: -50, end: 150 });
    expect(harness.geometry.getColumnBounds(1, "content")).toEqual({ start: 200, end: 400 });
    expect(harness.geometry.getColumnBounds(9)).toBeUndefined();

    harness.setColumns([column("a", 100), column("b", 100, true)]);
    expect(harness.geometry.getColumnBounds(1)).toBeUndefined();
    expect(harness.geometry.getCellBounds(0, 1)).toBeUndefined();
  });

  it("returns the content size from the resolved layout", () => {
    const harness = createHarness({ viewportWidth: 0 });
    expect(harness.geometry.getContentSize()).toEqual({
      width: 200,
      height: 100 * 32,
      coordinateSpace: "content",
    });
  });
});

describe("GridGeometry — rows and bounds", () => {
  it("reports the overscanned and visible windows", () => {
    const harness = createHarness({ rowCount: 1000, scrollTop: 64, viewportHeight: 320, overscan: 3 });
    harness.geometry.refresh();
    expect(harness.geometry.getVisibleRowWindow()).toEqual({ start: 2, end: 12 });
    expect(harness.geometry.getRowWindow()).toEqual({ start: 0, end: 15 });
  });

  it("returns row and cell bounds in every space", () => {
    const harness = createHarness({
      columns: [column("a", 200), column("b", 200)],
      mode: "fixed",
      viewportWidth: 300,
      scrollTop: 64,
      scrollLeft: 30,
    });
    harness.geometry.refresh();
    expect(harness.geometry.getRowBounds(5, "content")).toEqual({ start: 160, end: 192 });
    expect(harness.geometry.getRowBounds(5, "viewport")).toEqual({ start: 96, end: 128 });
    expect(harness.geometry.getRowBounds(-1)).toBeUndefined();
    expect(harness.geometry.getRowBounds(100)).toBeUndefined();
    expect(harness.geometry.getRowBounds(1.5)).toBeUndefined();

    const cell = harness.geometry.getCellBounds(5, 1, "viewport");
    expect(cell).toEqual({
      coordinateSpace: "viewport",
      rowIndex: 5,
      layoutIndex: 1,
      columnId: "b",
      top: 96,
      left: 170,
      width: 200,
      height: 32,
    });
    expect(harness.geometry.getCellBounds(5, 1, "rows")?.top).toBe(160);
  });

  it("keeps rows-space x relative to the rows wrapper while scrolled", () => {
    const harness = createHarness({
      columns: [column("a", 200), column("b", 200)],
      mode: "fixed",
      viewportWidth: 300,
      scrollLeft: 30,
    });
    harness.geometry.refresh();
    expect(harness.geometry.getCellBounds(5, 1, "rows")?.left).toBe(200);
    expect(harness.geometry.getColumnBounds(1, "rows")).toEqual({ start: 200, end: 400 });
  });

  it("offers the end insertion edge but rejects invalid boundaries", () => {
    const harness = createHarness({ rowCount: 10, rowHeight: 20 });
    harness.geometry.refresh();
    expect(harness.geometry.getRowEdgeOffset(0)).toBe(0);
    expect(harness.geometry.getRowEdgeOffset(10)).toBe(200);
    expect(harness.geometry.getRowEdgeOffset(3, "content")).toBe(60);
    expect(harness.geometry.getRowEdgeOffset(-1)).toBeUndefined();
    expect(harness.geometry.getRowEdgeOffset(11)).toBeUndefined();
    expect(harness.geometry.getRowEdgeOffset(2.5)).toBeUndefined();
  });

  it("keeps an empty grid empty", () => {
    const harness = createHarness({ rowCount: 0 });
    harness.geometry.refresh();
    expect(harness.geometry.getRowWindow()).toEqual({ start: 0, end: 0 });
    expect(harness.geometry.getVisibleRowWindow()).toEqual({ start: 0, end: 0 });
    expect(harness.geometry.getRowBounds(0)).toBeUndefined();
    expect(harness.geometry.getRowEdgeOffset(0)).toBe(0);
  });
});

describe("GridGeometry — hit testing", () => {
  it("resolves a viewport point to row and column indices", () => {
    const harness = createHarness({ viewportWidth: 400, scrollTop: 64 });
    harness.geometry.refresh();
    expect(harness.geometry.hitTest({ x: 10, y: 10 })).toEqual({
      row: 2,
      displayIndex: 0,
      col: 0,
      columnId: "a",
      region: "center",
      rowRegion: "suffix",
    });
    expect(harness.geometry.hitTest({ x: 250, y: 100 })).toMatchObject({
      row: 5,
      displayIndex: 1,
      col: 1,
    });
  });

  it("keeps layout indices when a column on the left is hidden", () => {
    const harness = createHarness({
      viewportWidth: 400,
      mode: "fixed",
      columns: [column("a", 100, true), column("b", 100), column("c", 100)],
    });
    harness.geometry.refresh();
    // A hidden column keeps its layout index: display and model index differ.
    expect(harness.geometry.hitTest({ x: 10, y: 10 })).toMatchObject({
      displayIndex: 0,
      col: 1,
      columnId: "b",
    });
    expect(harness.geometry.hitTest({ x: 150, y: 10 })).toMatchObject({
      displayIndex: 1,
      col: 2,
      columnId: "c",
    });
  });

  it("accepts an explicit DOM scroll sample and clamps before/after sentinels", () => {
    const harness = createHarness({ viewportWidth: 400 });
    harness.geometry.refresh();
    expect(harness.geometry.hitTest({ x: 10, y: 0, scrollTop: 320 })).toMatchObject({ row: 10 });
    expect(harness.geometry.hitTest({ x: -50, y: 10 })).toMatchObject({ displayIndex: -1, col: -1 });
    const pastEnd = harness.geometry.hitTest({ x: 10000, y: 10 });
    // A point past the last displayed column reports the displayed count and
    // no column; consumers that want the nearest cell clamp it themselves.
    expect(pastEnd).toMatchObject({ displayIndex: 2, col: -1 });
    expect(pastEnd.columnId).toBeUndefined();
    expect(harness.geometry.hitTest({ x: 10, y: -10 }).row).toBe(-1);
    expect(harness.geometry.hitTest({ x: 10, y: 100_000 }).row).toBe(100);
  });

  it("resolves the axes independently and reports an empty grid", () => {
    const harness = createHarness({ rowCount: 0, viewportWidth: 400 });
    harness.geometry.refresh();
    expect(harness.geometry.hitTest({ x: 10, y: 10 })).toEqual({
      row: -1,
      displayIndex: 0,
      col: 0,
      columnId: "a",
      region: "center",
      rowRegion: null,
    });
    harness.setColumns([]);
    expect(harness.geometry.hitTest({ x: 10, y: 10 })).toEqual({
      row: -1,
      displayIndex: -1,
      col: -1,
      columnId: undefined,
      region: null,
      rowRegion: null,
    });
  });
});

describe("GridGeometry — query cost and compressed bounds", () => {
  it("does not re-resolve the layout for hit tests or scroll updates", () => {
    let overrideReads = 0;
    const harness = createHarness({ viewportWidth: 400 });
    const deps = harness.deps;
    const isWidthOverridden = deps.isWidthOverridden;
    deps.isWidthOverridden = (layoutIndex) => {
      overrideReads += 1;
      return isWidthOverridden(layoutIndex);
    };
    const layout = harness.geometry.refresh();
    const readsAfterResolve = overrideReads;

    for (let step = 0; step < 1_000; step += 1) {
      harness.setViewport({ scrollLeft: step % 50, scrollTop: step });
      harness.geometry.refresh();
      harness.geometry.hitTest({ x: step % 200, y: 10 });
      harness.geometry.getCellBounds(step % 100, 1);
    }
    expect(overrideReads).toBe(readsAfterResolve);
    expect(harness.geometry.getColumnLayout()).toBe(layout);
  });

  it("measures viewport-space cell bounds from the logical scroll top", () => {
    // DOM 1,600 px maps to logical 160,000 px: row 5,000 sits at the top.
    const harness = createHarness({
      rowCount: 1_000_000,
      viewportWidth: 400,
      scrollTop: 1_600,
      mapping: { ratio: 0.01 },
    });
    harness.geometry.refresh();
    const cell = harness.geometry.getCellBounds(5_002, 0, "viewport");
    const row = harness.geometry.getRowBounds(5_002, "viewport");
    expect(row).toEqual({ start: 64, end: 96 });
    expect(cell).toMatchObject({ top: 64, height: 32 });
    expect(harness.geometry.getCellBounds(5_002, 0, "content")).toMatchObject({ top: 5_002 * 32 });
  });
});

describe("GridGeometry — scroll targets", () => {
  it("returns nothing for an already visible cell", () => {
    const harness = createHarness({ viewportWidth: 400, scrollTop: 0 });
    harness.geometry.refresh();
    expect(harness.geometry.getScrollTarget(1, 0)).toEqual({});
  });

  it("moves each axis independently", () => {
    const harness = createHarness({ viewportWidth: 400, viewportHeight: 320, scrollTop: 64 });
    harness.geometry.refresh();
    // Row 30 ends at 992; a 320px viewport needs logical top 672.
    expect(harness.geometry.getScrollTarget(30, 0)).toEqual({ scrollTop: 672 });
    // Row 1 is above the viewport, so only the vertical axis moves.
    expect(harness.geometry.getScrollTarget(1, 0, { scrollTop: 64, scrollLeft: 250 })).toEqual({
      scrollTop: 32,
      scrollLeft: 0,
    });
    // Row 5 is visible, so only the horizontal axis moves.
    expect(harness.geometry.getScrollTarget(5, 0, { scrollTop: 64, scrollLeft: 250 })).toEqual({
      scrollLeft: 0,
    });
  });

  it("aligns a cell larger than the viewport to its start", () => {
    const harness = createHarness({ viewportWidth: 150, viewportHeight: 32 });
    harness.geometry.refresh();
    expect(harness.geometry.getScrollTarget(5, 1)).toEqual({ scrollLeft: 50, scrollTop: 160 });
  });

  it("clamps to the reachable range", () => {
    const harness = createHarness({ rowCount: 10, viewportWidth: 400, viewportHeight: 320 });
    harness.geometry.refresh();
    expect(harness.geometry.getScrollTarget(9, 0)).toEqual({});
    const deep = createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320 });
    deep.geometry.refresh();
    expect(deep.geometry.getScrollTarget(999, 0)).toEqual({ scrollTop: 31680 });
  });

  it("snaps a bottom alignment up to the next row boundary", () => {
    const harness = createHarness({
      rowCount: 100,
      rowHeight: 30,
      viewportHeight: 100,
      scrollTop: 0,
    });
    harness.geometry.refresh();
    // Row 5 ends at 180; with a 100px viewport the wanted logical top is 80,
    // which snaps up to the 90 boundary.
    expect(harness.geometry.getScrollTarget(5, 0)).toEqual({ scrollTop: 90 });
  });

  it("maps compressed scroll targets through the mapping", () => {
    const harness = createHarness({
      rowCount: 1_000_000,
      viewportHeight: 320,
      mapping: { ratio: 0.01 },
    });
    harness.geometry.refresh();
    const target = harness.geometry.getScrollTarget(500_000, 0) as { scrollTop: number };
    // The compressed range is rounded to whole rows, so the DOM value is a
    // few px off the raw product; the round trip is what must hold.
    expect(target.scrollTop).toBeCloseTo(500_000 * 32 * 0.01, -2);
    const back = harness.geometry.hitTest({ x: 10, y: 0, scrollTop: 160_000 });
    expect(back.row).toBe(500_000);
  });

  it("returns nothing for hidden or invalid targets", () => {
    const harness = createHarness({ viewportWidth: 400 });
    harness.geometry.refresh();
    expect(harness.geometry.getScrollTarget(0, 5)).toEqual({});
    expect(harness.geometry.getScrollTarget(-1, 0)).toEqual({});
    expect(harness.geometry.getScrollTarget(0, 0.5)).toEqual({});
  });
});

describe("GridGeometry — guards", () => {
  it("rejects a cell on a row outside the axis", () => {
    const harness = createHarness({ rowCount: 10 });
    expect(harness.geometry.getCellBounds(10, 0)).toBeUndefined();
    expect(harness.geometry.getCellBounds(-1, 0)).toBeUndefined();
  });

  it("ignores a layout mode that is already active", () => {
    const harness = createHarness({ mode: "fit" });
    harness.geometry.refresh();
    const before = harness.geometry.revision;
    harness.geometry.setColumnLayoutMode("fit");
    expect(harness.geometry.revision).toBe(before);
    expect(harness.geometry.getColumnLayoutMode()).toBe("fit");
  });

  it("leaves an oversized row alone once its top is aligned", () => {
    const harness = createHarness({ rowCount: 100, viewportHeight: 20, scrollTop: 64 });
    expect(harness.geometry.getScrollTarget(2, 0)).toEqual({});
    expect(harness.geometry.getScrollTarget(3, 0)).toEqual({ scrollTop: 96 });
  });

  it("reads a non-finite scroll sample as 0", () => {
    const harness = createHarness({ rowCount: 100, scrollTop: Number.NaN, scrollLeft: Number.POSITIVE_INFINITY });
    expect(harness.geometry.getEffectiveScroll()).toEqual({ scrollTop: 0, scrollLeft: 0 });
    expect(harness.geometry.getVisibleRowWindow()).toEqual({ start: 0, end: 10 });
  });
});

describe("GridGeometry — out-of-range scroll samples", () => {
  it("answers windows, bounds and hit tests from the clamped sample", () => {
    const harness = createHarness({
      columns: [column("a", 200), column("b", 400)],
      mode: "fixed",
      viewportWidth: 300,
      viewportHeight: 320,
      scrollTop: 100_000,
      scrollLeft: 10_000,
    });
    harness.geometry.refresh();
    expect(harness.geometry.getEffectiveScroll()).toEqual({ scrollTop: 2880, scrollLeft: 300 });
    expect(harness.geometry.getVisibleRowWindow()).toEqual({ start: 90, end: 100 });
    expect(harness.geometry.getCellBounds(99, 1)).toMatchObject({ top: 288, left: -100 });
    expect(harness.geometry.hitTest({ x: 0, y: 0 })).toMatchObject({ row: 90, col: 1 });
    expect(harness.geometry.hitTest({ x: 0, y: 0, scrollTop: -50, scrollLeft: -50 })).toMatchObject({
      row: 0,
      col: 0,
    });
  });

  it("re-clamps when the content shrinks under a fixed sample", () => {
    const harness = createHarness({ rowCount: 1_000, viewportHeight: 320, scrollTop: 20_000 });
    harness.geometry.refresh();
    expect(harness.geometry.getEffectiveScroll().scrollTop).toBe(20_000);
    harness.setRowCount(50);
    harness.geometry.refresh();
    expect(harness.geometry.getEffectiveScroll().scrollTop).toBe(50 * 32 - 320);
    expect(harness.geometry.getVisibleRowWindow()).toEqual({ start: 40, end: 50 });
  });
});

describe("GridGeometry — revision", () => {
  it("advances on layout, dimension and window changes but not on scrolling", () => {
    const harness = createHarness({ rowCount: 1000, viewportHeight: 320 });
    harness.geometry.refresh();
    const initialRevision = harness.geometry.revision;
    expect(initialRevision).toBeGreaterThan(0);

    for (let i = 1; i <= 1000; i++) {
      harness.setViewport({ scrollTop: i * 32 });
      harness.geometry.refresh();
    }
    expect(harness.geometry.revision).toBeGreaterThan(initialRevision);
    const afterScroll = harness.geometry.revision;
    harness.geometry.refresh();
    expect(harness.geometry.revision).toBe(afterScroll);
  });

  it("advances on every column change and stamps the new snapshot with it", () => {
    const harness = createHarness({ viewportWidth: 0 });
    harness.geometry.refresh();
    const first = harness.geometry.revision;

    harness.setColumns([column("a", 150), column("b", 100)]);
    const resized = harness.geometry.getColumnLayout();
    expect(harness.geometry.revision).toBeGreaterThan(first);
    expect(resized.revision).toBe(harness.geometry.revision);

    harness.setColumns([column("a", 150), column("b", 100, true)]);
    const hidden = harness.geometry.getColumnLayout();
    expect(hidden.revision).toBeGreaterThan(resized.revision);
    expect(hidden.revision).toBe(harness.geometry.revision);

    harness.geometry.setColumnLayoutMode("fixed");
    expect(harness.geometry.getColumnLayout().revision).toBe(harness.geometry.revision);
    expect(harness.geometry.revision).toBeGreaterThan(hidden.revision);
  });

  it("advances when the same window gets a new width", () => {
    const harness = createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320 });
    harness.geometry.refresh();
    const before = harness.geometry.revision;
    harness.setViewport({ width: 800 });
    const layout = harness.geometry.refresh();
    expect(harness.geometry.revision).toBeGreaterThan(before);
    expect(layout.totalWidth).toBe(800);
  });

  it("keeps the revision stable while the row window is unchanged", () => {
    const harness = createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320 });
    harness.geometry.refresh();
    const before = harness.geometry.revision;
    harness.setRowCount(2000);
    harness.geometry.refresh();
    expect(harness.geometry.revision).toBe(before);
  });

  it("advances when the row window changes through a shrink", () => {
    const harness = createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320 });
    harness.geometry.refresh();
    const before = harness.geometry.revision;
    harness.setRowCount(2);
    harness.geometry.refresh();
    expect(harness.geometry.revision).toBeGreaterThan(before);
    expect(harness.geometry.getRowWindow()).toEqual({ start: 0, end: 2 });
  });
});

describe("GridGeometry — row regions", () => {
  const createRegionHarness = (frozenCount: number) =>
    createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320, frozenCount });

  it("publishes the C3 layout and answers region-local bounds", () => {
    const harness = createRegionHarness(3);
    harness.geometry.refresh();
    expect(harness.geometry.getRowRegions()).toEqual({
      frozenCount: 3,
      frozenExtent: 96,
      suffixViewportHeight: 224,
      frozen: { requestedCount: 3, effectiveCount: 3, limit: null },
    });
    // A frozen row answers its region-local range [offset, offset + rowHeight).
    expect(harness.geometry.getRowBounds(0, "viewport")).toEqual({ start: 0, end: 32 });
    expect(harness.geometry.getRowBounds(0)).toEqual({ start: 0, end: 32 });
    expect(harness.geometry.getRowBounds(0, "content")).toEqual({ start: 0, end: 32 });
    // Row 3 is the first suffix row at scrollTop 0.
    expect(harness.geometry.getRowBounds(3, "viewport")).toEqual({ start: 96, end: 128 });
  });

  it("clips each row to the region it renders in", () => {
    const harness = createRegionHarness(3);
    harness.geometry.refresh();
    expect(harness.geometry.getRowClip(0)).toEqual({ start: 0, end: 96 });
    expect(harness.geometry.getRowClip(2)).toEqual({ start: 0, end: 96 });
    expect(harness.geometry.getRowClip(3)).toEqual({ start: 96, end: 320 });
    expect(harness.geometry.getRowClip(999)).toEqual({ start: 96, end: 320 });
    expect(harness.geometry.getRowClip(-1)).toBeUndefined();
    expect(harness.geometry.getRowClip(1000)).toBeUndefined();
    expect(harness.geometry.getRowClip(2.5)).toBeUndefined();
  });

  it("hit-tests the frozen band before scroll and keeps the sentinels region-less", () => {
    const harness = createRegionHarness(3);
    harness.geometry.refresh();
    const rowAt = (y: number): { row: number; rowRegion: string | null } => {
      const hit = harness.geometry.hitTest({ x: 10, y });
      return { row: hit.row, rowRegion: hit.rowRegion };
    };
    expect(rowAt(0)).toEqual({ row: 0, rowRegion: "frozen" });
    expect(rowAt(31.9)).toEqual({ row: 0, rowRegion: "frozen" });
    expect(rowAt(32)).toEqual({ row: 1, rowRegion: "frozen" });
    expect(rowAt(95)).toEqual({ row: 2, rowRegion: "frozen" });
    expect(rowAt(96)).toEqual({ row: 3, rowRegion: "suffix" });
    expect(rowAt(-10)).toEqual({ row: -1, rowRegion: null });
    expect(rowAt(100_000)).toEqual({ row: 1000, rowRegion: null });

    // The band wins over the scroll offset: a scrolled grid keeps hitting it.
    harness.setViewport({ scrollTop: 5000 });
    const scrolled = harness.geometry.hitTest({ x: 10, y: 40 });
    expect(scrolled.row).toBe(1);
    expect(scrolled.rowRegion).toBe("frozen");
  });

  it("omits scrollTop for frozen rows and keeps the suffix rules", () => {
    const harness = createRegionHarness(3);
    harness.geometry.refresh();
    // A frozen row never needs vertical movement, however far it is scrolled.
    expect(harness.geometry.getScrollTarget(0, 0, { scrollTop: 5000, scrollLeft: 0 })).toEqual({});
    expect(harness.geometry.getScrollTarget(2, 0, { scrollTop: 5000, scrollLeft: 0 })).toEqual({});
    // The first suffix row is visible at the clip top.
    expect(harness.geometry.getScrollTarget(3, 0)).toEqual({});
    // Hidden above the clip: align it to the clip start.
    expect(harness.geometry.getScrollTarget(3, 0, { scrollTop: 500, scrollLeft: 0 })).toEqual({
      scrollTop: 0,
    });
    // Below the clip bottom: the flat end rule still applies.
    expect(harness.geometry.getScrollTarget(40, 0)).toEqual({ scrollTop: 992 });
  });

  it("keeps the content size and the scroll range independent of the count", () => {
    const flat = createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320 });
    const frozen = createRegionHarness(3);
    flat.geometry.refresh();
    frozen.geometry.refresh();
    expect(frozen.geometry.getContentSize()).toEqual(flat.geometry.getContentSize());
    expect(frozen.geometry.getContentSize().height).toBe(32_000);
    expect(frozen.geometry.getRowScrollRange()).toEqual(flat.geometry.getRowScrollRange());
    expect(frozen.geometry.getRowScrollRange()).toEqual({ start: 0, end: 31_680 });
    expect(frozen.geometry.hasVerticalScrollRange()).toBe(true);
  });

  it("bumps the revision once per region change and never on a raw scroll sample", () => {
    const harness = createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320 });
    harness.geometry.refresh();
    const layout = harness.geometry.getRowRegions();
    const before = harness.geometry.revision;

    expect(harness.geometry.syncRowRegions()).toBe(layout);
    expect(harness.geometry.revision).toBe(before);

    harness.setViewport({ scrollTop: 320 });
    harness.geometry.syncRowRegions();
    expect(harness.geometry.getRowRegions()).toBe(layout);
    expect(harness.geometry.revision).toBe(before);

    harness.setFrozenCount(3);
    harness.geometry.syncRowRegions();
    expect(harness.geometry.getRowRegions().frozenCount).toBe(3);
    expect(harness.geometry.revision).toBeGreaterThan(before);
    const afterRegionChange = harness.geometry.revision;
    harness.geometry.syncRowRegions();
    expect(harness.geometry.revision).toBe(afterRegionChange);
  });

  it("resolves the auto-scroll edges and limits from the region layout", () => {
    const flat = createHarness({ rowCount: 1000, viewportWidth: 400, viewportHeight: 320 });
    flat.geometry.refresh();
    expect(flat.geometry.getRowScrollEdges(64, 320)).toEqual({
      region: { frozenExtent: 0, suffixViewportHeight: 320 },
      limits: { scrollTop: 64, maxScrollTop: 31_680 },
    });

    const frozen = createRegionHarness(3);
    frozen.geometry.refresh();
    expect(frozen.geometry.getRowScrollEdges(64, 320)).toEqual({
      region: { frozenExtent: 96, suffixViewportHeight: 224 },
      limits: { scrollTop: 64, maxScrollTop: 31_680 },
    });
    // A sample past the reachable range clamps to the scroll limit.
    expect(frozen.geometry.getRowScrollEdges(100_000, 320).limits).toEqual({
      scrollTop: 31_680,
      maxScrollTop: 31_680,
    });
    expect(frozen.geometry.getRowScrollEdges(-10, 320).limits.scrollTop).toBe(0);
    // A collapsed body has no suffix clip left below the band.
    expect(frozen.geometry.getRowScrollEdges(0, 0).region).toEqual({
      frozenExtent: 96,
      suffixViewportHeight: 0,
    });
  });
});
