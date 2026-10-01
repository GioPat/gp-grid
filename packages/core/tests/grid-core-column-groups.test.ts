// packages/core/tests/grid-core-column-groups.test.ts
// PRD 007 D6/D7 through GridCore: depth-first adoption, hierarchy replacement
// with its bands, reset order, rejected replacements and over-budget moves,
// and going flat.

import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { EMPTY_HEADER_FRAGMENTS } from "../src/column-groups";
import type {
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupDefinition,
  ColumnGroupLimits,
  ColumnSchemaError,
  GridCoreOptions,
  GridInstruction,
} from "../src/types";

type Row = Record<string, unknown>;

const column = (id: string): ColumnDefinition => ({ field: id, cellDataType: "text", width: 100 });

const group = (groupId: string, ...children: ColumnGroupChild[]): ColumnGroupDefinition => ({
  groupId,
  children,
});

/** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
const prdFixture = (): ColumnGroupChild[] => [
  group("Region", group("North", group("Q1", "a", "b"), "c"), "d"),
  group("Totals", "e", "f"),
  "x",
];

/** Defined out of descriptor order, so adoption has to reorder them. */
const reversedColumns = (): ColumnDefinition[] =>
  ["x", "f", "e", "d", "c", "b", "a"].map(column);

interface Fixture {
  grid: GridCore<Row>;
  batches: GridInstruction[][];
  rejected: ColumnSchemaError[];
}

const createGrid = (options: {
  columns?: ColumnDefinition[];
  columnGroups?: readonly ColumnGroupChild[];
  columnGroupLimits?: ColumnGroupLimits;
  onColumnMoved?: GridCoreOptions<Row>["onColumnMoved"];
} = {}): Fixture => {
  const rejected: ColumnSchemaError[] = [];
  const grid = new GridCore<Row>({
    columns: options.columns ?? reversedColumns(),
    columnGroups: options.columnGroups,
    columnGroupLimits: options.columnGroupLimits,
    dataSource: createClientDataSource([{ id: 1 }, { id: 2 }]),
    rowHeight: 32,
    columnLayout: "fixed",
    onColumnMoved: options.onColumnMoved,
    onColumnSchemaRejected: (error) => rejected.push(error),
  });
  grid.setViewport(0, 0, 2_000, 300);
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push(batch));
  return { grid, batches, rejected };
};

const ids = (grid: GridCore<Row>): string[] =>
  grid.geometry.getColumnLayout().columns.map((displayed) => displayed.columnId);

const fragmentIds = (grid: GridCore<Row>): string[] => {
  const { start, center, end } = grid.geometry.getColumnWindow().groups;
  return [...start, ...center, ...end].map((fragment) => fragment.fragmentId);
};

const ofType = <T extends GridInstruction["type"]>(
  batches: GridInstruction[][],
  type: T,
): Extract<GridInstruction, { type: T }>[] =>
  batches.flat().filter((instruction): instruction is Extract<GridInstruction, { type: T }> =>
    instruction.type === type);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("column groups — adoption", () => {
  it("orders the leaves depth-first and publishes their fragments", () => {
    const groups = prdFixture();
    const { grid } = createGrid({ columnGroups: groups });
    expect(ids(grid)).toEqual(["a", "b", "c", "d", "e", "f", "x"]);
    expect(grid.geometry.getColumnLayout().bandCount).toBe(4);
    expect(grid.columns.getGroups()).toBe(groups);
    expect(fragmentIds(grid)).toEqual([
      "Region:center:0",
      "Totals:center:0",
      "North:center:0",
      "Q1:center:0",
    ]);
  });

  it("stays flat and warns once when the hierarchy is rejected", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { grid } = createGrid({ columnGroups: [group("G", "a", "b")] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('Column "x" is missing');
    expect(grid.columns.getGroups()).toBeNull();
    expect(ids(grid)).toEqual(["x", "f", "e", "d", "c", "b", "a"]);
    expect(grid.geometry.getColumnLayout().bandCount).toBe(1);
  });

  it("skips the guard on a flat grid and shares the empty fragment lists", () => {
    const { grid } = createGrid();
    expect(grid.columns.move(0, 2)).toEqual({ status: "applied" });
    expect(grid.columns.setPinned("a", "start")).toEqual({ status: "applied" });
    expect(grid.columns.setPinned("a", "start")).toEqual({ status: "unchanged" });
    expect(grid.columns.set(reversedColumns())).toEqual({ status: "applied" });
    expect(grid.geometry.getColumnWindow().groups).toBe(EMPTY_HEADER_FRAGMENTS);
  });
});

describe("column groups — replacement", () => {
  it("keeps surviving width, pin and order and drops removed ids in one batch", () => {
    const { grid, batches } = createGrid({ columnGroups: prdFixture() });
    grid.columns.setState([{ columnId: "c", width: 150 }]);
    grid.columns.setPinned("x", "start");
    expect(ids(grid)).toEqual(["x", "a", "b", "c", "d", "e", "f"]);
    grid.columns.move(5, 4);
    expect(ids(grid)).toEqual(["x", "a", "b", "c", "e", "d", "f"]);
    batches.length = 0;

    const groups = [group("North", group("Q1", "a"), "b", "c"), "d", group("Totals", "e", "g"), "x"];
    const columns = ["a", "b", "c", "d", "e", "g", "x"].map(column);
    expect(grid.columns.set(columns, groups)).toEqual({ status: "applied" });

    expect(batches).toHaveLength(1);
    const [changed] = ofType(batches, "COLUMNS_CHANGED");
    const [window] = ofType(batches, "SET_COLUMN_WINDOW");
    const bands = ofType(batches, "SET_HEADER_BANDS");
    expect(changed?.layout).toBe(window?.window.layout);
    expect(changed?.revision).toBe(window?.revision);
    expect(bands.map((instruction) => [instruction.bands.count, instruction.revision]))
      .toEqual([[3, changed?.revision]]);
    expect(bands[0]?.bands).toBe(grid.header.getBands());
    expect(ids(grid)).toEqual(["x", "a", "b", "c", "e", "d", "g"]);
    expect(changed?.layout?.bandCount).toBe(3);
    const state = grid.columns.getState();
    expect(state.find((entry) => entry.columnId === "c")?.width).toBe(150);
    expect(state.find((entry) => entry.columnId === "x")?.pinned).toBe("start");
    expect(state.some((entry) => entry.columnId === "f")).toBe(false);
    expect(window?.window.groups).toBe(grid.geometry.getColumnWindow().groups);
    expect(fragmentIds(grid)).toEqual([
      "North:center:0",
      "Totals:center:0",
      "Totals:center:1",
      "Q1:center:0",
    ]);
    expect(grid.columns.getGroups()).toBe(groups);
  });

  it("restores the descriptor order on resetState", () => {
    const { grid } = createGrid({ columnGroups: prdFixture() });
    grid.columns.move(6, 0);
    grid.columns.move(3, 1);
    expect(ids(grid)).not.toEqual(["a", "b", "c", "d", "e", "f", "x"]);
    expect(grid.columns.resetState()).toEqual({ status: "applied" });
    expect(ids(grid)).toEqual(["a", "b", "c", "d", "e", "f", "x"]);
  });

  it("rejects an invalid replacement without publishing a column change", () => {
    const groups = prdFixture();
    const { grid, batches, rejected } = createGrid({ columnGroups: groups });
    const before = grid.columns.getState();
    const cyclic = { groupId: "Loop", children: [] as ColumnGroupChild[] };
    cyclic.children.push(cyclic);
    batches.length = 0;

    const result = grid.columns.set(reversedColumns(), [cyclic, ...prdFixture()]);
    const error = {
      code: "cycle",
      source: "groups",
      id: "Loop",
      message: 'Column group "Loop" contains itself',
    };
    expect(result).toEqual({ status: "rejected", error });
    expect(rejected).toEqual([error]);
    expect(ofType(batches, "COLUMNS_CHANGED")).toEqual([]);
    expect(ofType(batches, "SET_ANNOUNCEMENT").map((i) => i.announcement?.message))
      .toEqual([error.message]);
    expect(grid.columns.getState()).toEqual(before);
    expect(grid.columns.getGroups()).toBe(groups);

    const withNewColumn = [...reversedColumns(), column("y")];
    expect(grid.columns.set(withNewColumn)).toMatchObject({
      status: "rejected",
      error: { code: "missingLeaf", id: "y" },
    });
    expect(grid.columns.getState()).toEqual(before);
  });
});

describe("column groups — budgets and going flat", () => {
  const budgeted = (onColumnMoved?: GridCoreOptions<Row>["onColumnMoved"]) =>
    createGrid({
      columns: ["a", "b", "x"].map(column),
      columnGroups: [group("G", "a", "b"), "x"],
      columnGroupLimits: { maxFragments: 1 },
      onColumnMoved,
    });

  it("rejects an over-budget move with order and pins unchanged", () => {
    const moved = vi.fn();
    const { grid, batches, rejected } = budgeted(moved);
    const before = grid.columns.getState();
    batches.length = 0;
    const result = grid.columns.move(2, 1);
    expect(result).toEqual({
      status: "rejected",
      error: {
        code: "limit",
        source: "move",
        limit: "maxFragments",
        message: "Column groups exceed the maxFragments budget",
      },
    });
    expect(rejected).toHaveLength(1);
    expect(moved).not.toHaveBeenCalled();
    expect(ids(grid)).toEqual(["a", "b", "x"]);
    expect(grid.columns.getState()).toEqual(before);
    expect(ofType(batches, "COLUMNS_CHANGED")).toEqual([]);

    expect(grid.columns.setPinned("a", "end")).toMatchObject({
      status: "rejected",
      error: { source: "pin" },
    });
    expect(grid.columns.setState([{ columnId: "x", order: 1 }])).toMatchObject({
      status: "rejected",
      error: { source: "state" },
    });
    expect(grid.columns.getState()).toEqual(before);

    expect(grid.columns.move(1, 0)).toEqual({ status: "applied" });
    expect(ids(grid)).toEqual(["b", "a", "x"]);
    expect(moved).toHaveBeenCalledTimes(1);
  });

  it("rejects an over-budget replacement and keeps the previous schema", () => {
    const { grid, batches } = budgeted();
    const groups = grid.columns.getGroups();
    const definitions = grid.columns.get();
    batches.length = 0;
    const result = grid.columns.set(
      ["a", "b", "x"].map(column),
      [group("G", "a"), group("H", "b"), "x"],
    );
    expect(result).toMatchObject({ status: "rejected", error: { code: "limit", source: "groups" } });
    expect(grid.columns.getGroups()).toBe(groups);
    expect(grid.columns.get()).toBe(definitions);
    expect(ofType(batches, "COLUMNS_CHANGED")).toEqual([]);
    expect(fragmentIds(grid)).toEqual(["G:center:0"]);
  });

  it("restores one band with setGroups(null)", () => {
    const groups = prdFixture();
    const { grid, batches } = createGrid({ columnGroups: groups });
    batches.length = 0;
    expect(grid.columns.setGroups(groups)).toEqual({ status: "unchanged" });
    expect(batches).toEqual([]);

    expect(grid.columns.setGroups(null)).toEqual({ status: "applied" });
    const layout = grid.geometry.getColumnLayout();
    expect(layout.bandCount).toBe(1);
    expect(layout.columns.every((displayed) => displayed.headerBand === 0)).toBe(true);
    expect(grid.geometry.getColumnWindow().groups).toBe(EMPTY_HEADER_FRAGMENTS);
    expect(grid.columns.getGroups()).toBeNull();
    expect(ids(grid)).toEqual(["x", "f", "e", "d", "c", "b", "a"]);

    expect(grid.columns.setGroups(groups)).toEqual({ status: "applied" });
    expect(grid.geometry.getColumnLayout().bandCount).toBe(4);
    expect(ids(grid)).toEqual(["a", "b", "c", "d", "e", "f", "x"]);
  });
});
