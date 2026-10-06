import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { AssignSlotInstruction, DataLoadedInstruction } from "../src/types/instructions";
import { isHierarchicalRowAccess, type ColumnDefinition, type GridInstruction } from "../src/types";
import {
  TOTAL_ID,
  createHierarchyFixture,
  createHierarchySource,
  type FixtureAccess,
  type FixtureRecord,
} from "./hierarchy-fixture";

const columns: ColumnDefinition[] = [
  { field: "country", cellDataType: "text", width: 120 },
  { field: "city", cellDataType: "text", width: 120 },
  { field: "amount", cellDataType: "number", width: 100 },
];

const createGrid = (access: () => FixtureAccess) => {
  const source = createHierarchySource(access);
  const grid = new GridCore<FixtureRecord>({
    columns,
    dataSource: source,
    rowHeight: 30,
    headerHeight: 30,
  });
  const instructions: GridInstruction[] = [];
  grid.onBatchInstruction((batch) => instructions.push(...batch));
  return { grid, source, instructions };
};

const lastLoaded = (instructions: readonly GridInstruction[]) =>
  instructions.filter((i): i is DataLoadedInstruction => i.type === "DATA_LOADED").at(-1);

const assigns = (instructions: readonly GridInstruction[]) =>
  instructions.filter((i): i is AssignSlotInstruction => i.type === "ASSIGN_SLOT");

// Expanded: total, IT, Rome, r1, r2, Milan, r3, FR (collapsed).
const expanded = { expanded: ["g:IT", "g:IT:Rome", "g:IT:Milan"] };

describe("RowStore under a source-supplied hierarchy (AC-008-08)", () => {
  it("binds the hierarchy and leaves the flat store empty", async () => {
    const { grid, instructions } = createGrid(() => createHierarchyFixture(expanded));
    await grid.initialize();
    const rowData = grid["rowData"];

    expect(rowData.getCachedRows().size).toBe(0);
    expect(rowData.getRowAccess()).toBeNull();
    expect(rowData.hasStableIdentity()).toBe(true);
    expect(grid.rows.getCount()).toBe(8);
    expect(lastLoaded(instructions)).toEqual({ type: "DATA_LOADED", totalRows: 8, hierarchical: true });
  });

  it("reads counts, ids, values and records by view index", async () => {
    const { grid } = createGrid(() => createHierarchyFixture(expanded));
    await grid.initialize();

    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => grid.rows.getId(i))).toEqual([
      TOTAL_ID, "g:IT", "g:IT:Rome", "r1", "r2", "g:IT:Milan", "r3", "g:FR",
    ]);
    expect(grid.rows.getId(8)).toBeUndefined();
    expect(grid.rows.has(7)).toBe(true);
    expect(grid.rows.has(8)).toBe(false);
    expect(grid.cells.getValue(0, 2)).toBe(100);
    expect(grid.cells.getValue(2, 2)).toBe(30);
    expect(grid.cells.getValue(3, 1)).toBe("Rome");
    expect(grid.cells.getFieldValue(4, "amount")).toBe(20);
    expect(grid.cells.getFieldValue(9, "amount")).toBeNull();
    expect(grid.rows.getData(3)).toMatchObject({ id: "r1", amount: 10 });
    expect(grid.rows.getData(4)).toBeUndefined();
  });

  it("gives group and total rows no record and returns the row union", async () => {
    const { grid } = createGrid(() => createHierarchyFixture(expanded));
    await grid.initialize();

    expect(grid.rows.getData(0)).toBeUndefined();
    expect(grid.rows.getData(1)).toBeUndefined();
    expect(grid.rows.getViewRow(0)).toEqual({
      kind: "total", id: TOTAL_ID, depth: 0, leafCount: 4, viewIndex: 0,
    });
    expect(grid.rows.getViewRow(1)).toEqual({
      kind: "group", id: "g:IT", depth: 0, expanded: true, childCount: 2, leafCount: 3,
      field: "country", value: "IT", viewIndex: 1,
    });
    expect(grid.rows.getViewRow(3)).toEqual({
      kind: "record", id: "r1", depth: 2, viewIndex: 3, record: grid.rows.getData(3),
    });
    expect(grid.rows.getViewRow(4)).toMatchObject({ kind: "record", id: "r2", record: undefined });
  });

  it("resolves a visible id and answers -1 for a hidden or removed one", async () => {
    const { grid } = createGrid(() => createHierarchyFixture(expanded));
    await grid.initialize();
    const rowData = grid["rowData"];

    expect(rowData.findViewIndexById("r3")).toBe(6);
    expect(rowData.findViewIndexById("g:FR")).toBe(7);
    // r4 sits under the collapsed FR group: `locate` answers 7, the store does not.
    expect(rowData.findViewIndexById("r4")).toBe(-1);
    expect(rowData.findViewIndexById("missing")).toBe(-1);
    expect(rowData.locateRowIds(new Set(["r1", "r4", "g:FR"]))).toEqual(
      new Map<string, number>([["r1", 3], ["g:FR", 7]]),
    );
    expect(rowData.locateRowIds(new Set(["r1", "r3"]), { start: 4, end: 8 })).toEqual(
      new Map([["r3", 6]]),
    );
  });

  it("publishes the row kind on slots", async () => {
    const { grid, instructions } = createGrid(() => createHierarchyFixture(expanded));
    await grid.initialize();
    grid.setViewport(0, 0, 400, 300);

    const byRow = new Map(assigns(instructions).map((i) => [i.rowIndex, i.row]));
    expect(byRow.get(0)).toMatchObject({ kind: "total" });
    expect(byRow.get(1)).toMatchObject({ kind: "group", id: "g:IT", depth: 0 });
    expect(byRow.get(3)).toEqual({ kind: "record", id: "r1", depth: 2 });
  });

  it("replaces the rows on a second query with a new revision", async () => {
    const accesses: FixtureAccess[] = [];
    let revision = 1;
    const { grid } = createGrid(() => {
      const access = createHierarchyFixture({ ...expanded, revision });
      accesses.push(access);
      return access;
    });
    await grid.initialize();
    revision = 2;
    await grid.refresh();

    expect(accesses).toHaveLength(2);
    expect(accesses[0].release).toHaveBeenCalledTimes(1);
    expect(accesses[1].release).not.toHaveBeenCalled();
    expect(grid.rows.getCount()).toBe(7);
    expect(grid.cells.getValue(0, 2)).toBe(120);
    expect(grid["rowData"].findViewIndexById("g:FR")).toBe(-1);
  });

  it("releases the hierarchy on setDataSource and returns to flat rows", async () => {
    const access = createHierarchyFixture(expanded);
    const { grid, instructions } = createGrid(() => access);
    await grid.initialize();
    await grid.setDataSource(createClientDataSource([{ id: "x", country: "DE", city: "Bonn", amount: 1 }]));

    expect(access.release).toHaveBeenCalledTimes(1);
    expect(grid.rows.getCount()).toBe(1);
    expect(grid.rows.getViewRow(0)).toMatchObject({ kind: "record", depth: 0 });
    expect(lastLoaded(instructions)).toEqual({ type: "DATA_LOADED", totalRows: 1 });
  });

  it("releases the hierarchy on destroy", async () => {
    const access = createHierarchyFixture();
    const { grid } = createGrid(() => access);
    await grid.initialize();
    grid.destroy();

    expect(access.release).toHaveBeenCalledTimes(1);
    expect(grid.rows.getCount()).toBe(0);
  });

  it("serves a provider without setExpanded and a re-bound access only once", async () => {
    const access = createHierarchyFixture({ withoutSetExpanded: true });
    const { grid } = createGrid(() => access);
    await grid.initialize();
    await grid.refresh();

    expect(access.setExpanded).toBeUndefined();
    expect(access.release).not.toHaveBeenCalled();
    expect(grid.rows.getCount()).toBe(3);
  });
});

describe("isHierarchicalRowAccess", () => {
  it("requires the explicit flag, not the hierarchy method names", () => {
    const flat = { rowCount: 1, getValue: () => null, getRow: () => undefined, locate: () => 0 };
    expect(isHierarchicalRowAccess(flat)).toBe(false);
    expect(isHierarchicalRowAccess(createHierarchyFixture())).toBe(true);
  });
});
