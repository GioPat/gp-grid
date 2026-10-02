// packages/core/tests/grid-core-header.test.ts
// PRD 007 D8 through GridCore: `header.setBandHeights` and hierarchy changes
// run one applier that publishes the bands with their extent, gives the body
// what the header takes, keeps the anchor and re-resolves the frozen rows.

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type {
  ColumnDefinition,
  ColumnGroupChild,
  FreezeRowsOptions,
  GridInstruction,
} from "../src/types";
import type { FrozenRowsState } from "../src/geometry";

interface Row {
  id: number;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const WIDTH = 800;
const HEIGHT = 320;

const column = (field: string): ColumnDefinition => ({ field, cellDataType: "text", width: 100 });

/** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
const prdFixture = (): ColumnGroupChild[] => [
  { groupId: "Region", children: [
    { groupId: "North", children: [{ groupId: "Q1", children: ["a", "b"] }, "c"] },
    "d",
  ] },
  { groupId: "Totals", children: ["e", "f"] },
  "x",
];

const createGrid = async (options: { count?: number; freezeRows?: FreezeRowsOptions } = {}) => {
  const frozenChanges: FrozenRowsState[] = [];
  const count = options.count ?? 1_000;
  const grid = new GridCore<Row>({
    columns: ["a", "b", "c", "d", "e", "f", "x"].map(column),
    dataSource: createClientDataSource(Array.from({ length: count }, (_, id) => ({ id }))),
    getRowId: (row) => row.id,
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    overscan: 2,
    columnLayout: "fixed",
    freezeRows: options.freezeRows,
    onFrozenRowsChanged: (state) => frozenChanges.push(state),
  });
  await grid.initialize();
  grid.setViewport(0, 0, WIDTH, HEIGHT);
  return { grid, frozenChanges };
};

const record = (grid: GridCore<Row>): GridInstruction[][] => {
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push([...batch]));
  return batches;
};

const ofType = <T extends GridInstruction["type"]>(
  batches: GridInstruction[][],
  type: T,
): Extract<GridInstruction, { type: T }>[] =>
  batches.flat().filter((instruction): instruction is Extract<GridInstruction, { type: T }> =>
    instruction.type === type);

const lastContentSize = (batches: GridInstruction[][]) => ofType(batches, "SET_CONTENT_SIZE").at(-1);

const viewportTop = (grid: GridCore<Row>, viewIndex: number): number | undefined =>
  grid.geometry.getRowBounds(viewIndex, "viewport")?.start;

describe("GridCore.header — setBandHeights", () => {
  it("publishes a flat grid's one band of headerHeight with its first content size", async () => {
    const grid = new GridCore<Row>({
      columns: [column("a")],
      dataSource: createClientDataSource([{ id: 0 }]),
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
    });
    const batches = record(grid);
    await grid.initialize();
    const [published] = ofType(batches, "SET_HEADER_BANDS");
    expect(published?.bands).toEqual({ count: 1, heights: [36], offsets: [0], totalHeight: 36 });
    expect(published?.bands).toBe(grid.header.getBands());
    expect(lastContentSize(batches)?.height).toBe(ROW_HEIGHT + HEADER_HEIGHT);
  });

  it("publishes the bands, the content size and the row regions in one batch", async () => {
    const { grid } = await createGrid();
    const batches = record(grid);

    grid.header.setBandHeights([72]);

    expect(batches).toHaveLength(1);
    const [bands] = ofType(batches, "SET_HEADER_BANDS");
    const [regions] = ofType(batches, "SET_ROW_REGIONS");
    const contentSize = lastContentSize(batches);
    expect(bands?.bands).toEqual({ count: 1, heights: [72], offsets: [0], totalHeight: 72 });
    expect(regions?.regions.suffixViewportHeight).toBe(HEIGHT - 36);
    expect(contentSize?.height).toBe(grid.geometry.getContentSize().height + 72);
    expect(contentSize?.revision).toBe(bands?.revision);
  });

  it("lowers the viewport by the growth; the same wrapper report publishes nothing", async () => {
    const { grid } = await createGrid();
    grid.setViewport(3_200, 0, WIDTH, HEIGHT);
    const batches = record(grid);

    grid.header.setBandHeights([72]);
    expect(lastContentSize(batches)?.viewportHeight).toBe(HEIGHT - 36);
    grid.setViewport(3_200, 0, WIDTH, HEIGHT - 36);
    expect(batches).toHaveLength(1);

    grid.header.setBandHeights([24]);
    expect(lastContentSize(batches)?.viewportHeight).toBe(HEIGHT + 12);
    grid.setViewport(3_200, 0, WIDTH, HEIGHT);
    expect(lastContentSize(batches)?.viewportHeight).toBe(HEIGHT);
  });

  it("publishes nothing for a value-equal list or bands that resolve the same", async () => {
    const { grid } = await createGrid();
    grid.header.setBandHeights([72]);
    const bands = grid.header.getBands();
    const batches = record(grid);

    grid.header.setBandHeights([72]);
    grid.header.setBandHeights([72, 50]);

    expect(batches).toEqual([]);
    expect(grid.header.getBands()).toBe(bands);
  });

  it("throws on an invalid height and applies nothing", async () => {
    const { grid } = await createGrid();
    const bands = grid.header.getBands();
    const batches = record(grid);

    expect(() => grid.header.setBandHeights([72, Number.NaN]))
      .toThrow(new RangeError("Invalid headerBandHeights[1]: NaN"));
    expect(() => grid.header.setBandHeights([0])).toThrow(RangeError);

    expect(batches).toEqual([]);
    expect(grid.header.getBands()).toBe(bands);
  });

  it("is a no-op after destroy", async () => {
    const { grid } = await createGrid();
    const bands = grid.header.getBands();
    grid.destroy();
    grid.header.setBandHeights([72]);
    expect(grid.header.getBands()).toBe(bands);
  });
});

describe("GridCore.header — anchor and frozen rows (AC-007-05)", () => {
  it("keeps the first visible row's offset below the header", async () => {
    const { grid } = await createGrid();
    grid.setViewport(3_210, 0, WIDTH, HEIGHT);
    const first = grid.geometry.getVisibleRowWindow().start;
    const top = viewportTop(grid, first);
    const batches = record(grid);

    grid.header.setBandHeights([108]);

    expect(ofType(batches, "SCROLL_TO")).toEqual([]);
    expect(grid.geometry.getVisibleRowWindow().start).toBe(first);
    expect(viewportTop(grid, first)).toBe(top);
  });

  it("restores the anchor through a compressed mapping", async () => {
    const { grid } = await createGrid({ count: 400_000 });
    grid.setViewport(4_000_000, 0, WIDTH, HEIGHT);
    expect(grid.viewport.isScaling()).toBe(true);
    const first = grid.geometry.getVisibleRowWindow().start;
    const top = viewportTop(grid, first) ?? Number.NaN;
    const ratio = grid.viewport.getScrollRatio();
    const batches = record(grid);

    grid.header.setBandHeights([136]);

    expect(grid.viewport.getScrollRatio()).not.toBe(ratio);
    expect(ofType(batches, "SCROLL_TO")).toHaveLength(1);
    expect(grid.geometry.getVisibleRowWindow().start).toBe(first);
    expect(viewportTop(grid, first)).toBeCloseTo(top, 6);
  });

  it("lowers the effective frozen count when the band no longer fits", async () => {
    const { grid, frozenChanges } = await createGrid({ freezeRows: { count: 5 } });
    expect(grid.frozenRows.get()).toEqual({ requestedCount: 5, effectiveCount: 5, limit: null });
    const settled = frozenChanges.length;
    const batches = record(grid);

    grid.header.setBandHeights([136]);

    const expected = { requestedCount: 5, effectiveCount: 4, limit: "viewport" };
    expect(batches).toHaveLength(1);
    expect(grid.frozenRows.get()).toEqual(expected);
    expect(ofType(batches, "SET_ROW_REGIONS").at(-1)?.regions.frozenCount).toBe(4);
    expect(ofType(batches, "SET_ANNOUNCEMENT")).toHaveLength(1);
    expect(frozenChanges.slice(settled)).toEqual([expected]);
  });
});

describe("GridCore.header — band count changes", () => {
  it("adopts a hierarchy's bands through the same applier", async () => {
    const { grid } = await createGrid();
    grid.header.setBandHeights([24]);
    const batches = record(grid);

    grid.columns.setGroups(prdFixture());

    expect(batches).toHaveLength(1);
    const [bands] = ofType(batches, "SET_HEADER_BANDS");
    expect(bands?.bands).toEqual({
      count: 4,
      heights: [24, 36, 36, 36],
      offsets: [0, 24, 60, 96],
      totalHeight: 132,
    });
    expect(lastContentSize(batches)?.viewportHeight).toBe(HEIGHT + HEADER_HEIGHT - 132);
  });

  it("follows the visible hierarchy through hide, show and going flat", async () => {
    const { grid } = await createGrid();
    grid.columns.setGroups(prdFixture());
    const batches = record(grid);

    grid.columns.setState([
      { columnId: "a", hidden: true },
      { columnId: "b", hidden: true },
    ]);
    expect(grid.header.getBands().count).toBe(3);
    expect(lastContentSize(batches)?.viewportHeight).toBe(HEIGHT - 72);

    grid.columns.setState([{ columnId: "a", hidden: false }]);
    expect(grid.header.getBands().count).toBe(4);
    grid.columns.setGroups(null);
    expect(grid.header.getBands().count).toBe(1);
    expect(lastContentSize(batches)?.viewportHeight).toBe(HEIGHT);
    expect(ofType(batches, "SET_HEADER_BANDS").map((i) => i.bands.count)).toEqual([3, 4, 1]);
  });
});
