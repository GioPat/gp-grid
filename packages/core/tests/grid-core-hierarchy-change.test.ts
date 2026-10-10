// PRD 008 D4: focus, anchor, heights and the frozen prefix across a change of
// the view rows (AC-008-05).

import { describe, expect, it } from "vitest";
import type { GridInstruction, ScrollToInstruction } from "../src/types";
import type { AssignSlotInstruction } from "../src/types/instructions";
import {
  createHierarchyFixture,
  createHierarchyGrid,
  type FixtureAccess,
} from "./hierarchy-fixture";

// Expanded: total, IT, Rome, r1, r2, Milan, r3, FR, Paris, r4.
const ALL = ["g:IT", "g:IT:Rome", "g:IT:Milan", "g:FR", "g:FR:Paris"];

const scrolls = (batches: readonly GridInstruction[][]): number[] =>
  batches
    .flat()
    .filter((i): i is ScrollToInstruction => i.type === "SCROLL_TO")
    .map((i) => i.scrollTop);

/** Ten rows of 30 px in a 120 px viewport. */
const mountExpanded = async (next: () => FixtureAccess = () => createHierarchyFixture({ expanded: ALL })) => {
  const setup = createHierarchyGrid(next);
  await setup.grid.initialize();
  setup.grid.setViewport(0, 0, 400, 120);
  return setup;
};

const heightOf = (grid: Awaited<ReturnType<typeof mountExpanded>>["grid"], viewIndex: number) => {
  const bounds = grid.geometry.getRowBounds(viewIndex, "content");
  return bounds === undefined ? 0 : bounds.end - bounds.start;
};

describe("hierarchy change — active cell", () => {
  it("moves the active cell to the collapsed group row in the same column", async () => {
    const { grid } = await mountExpanded();
    grid.selection.setActiveCell(3, 2);
    grid.selection.setSelectionRange({ startRow: 3, startCol: 0, endRow: 4, endCol: 2 });

    grid.rowGroups.toggle("g:IT:Rome");
    expect(grid.selection.getActiveCell()).toEqual({ row: 2, col: 2 });
    expect(grid.selection.getSelectionRange()).toBeNull();

    grid.rowGroups.toggle("g:IT");
    expect(grid.selection.getActiveCell()).toEqual({ row: 1, col: 2 });
  });

  it("keeps a visible active row by identity", async () => {
    const { grid } = await mountExpanded();
    grid.selection.setActiveCell(8, 1);

    grid.rowGroups.toggle("g:IT");
    expect(grid.rows.getId(grid.selection.getActiveCell()!.row)).toBe("g:FR:Paris");
    expect(grid.selection.getActiveCell()).toEqual({ row: 3, col: 1 });
  });
});

describe("hierarchy change — scroll anchor", () => {
  it("keeps the first visible row's offset when a group above the viewport collapses", async () => {
    const { grid, batches } = await mountExpanded();
    grid.setViewport(160, 0, 400, 120);
    batches.length = 0;

    grid.rowGroups.toggle("g:IT:Rome");

    // Milan moved from row 5 to row 3; the clip top stays 10 px into it. The
    // shrink's clamp correction may precede the anchor's in the same batch.
    expect(batches).toHaveLength(1);
    expect(scrolls(batches).at(-1)).toBe(100);
  });

  it("resolves a collapsed anchor row to its ancestor with no intra offset", async () => {
    const { grid, batches } = await mountExpanded();
    grid.setViewport(100, 0, 400, 120);
    batches.length = 0;

    grid.rowGroups.toggle("g:IT:Rome");

    // r1 (row 3, 10 px in) is hidden; Rome is row 2.
    expect(scrolls(batches)).toEqual([60]);
  });
});

describe("hierarchy change — row heights", () => {
  it("keeps a leaf's height through a collapse and an expand, and a group row's height", async () => {
    const { grid } = await mountExpanded();
    grid.rowHeights.set([
      { rowId: "r3", height: 60 },
      { rowId: "g:FR", height: 50 },
    ]);
    expect(heightOf(grid, 6)).toBe(60);
    expect(heightOf(grid, 7)).toBe(50);

    grid.rowGroups.toggle("g:IT");
    // total, IT, FR, Paris, r4
    expect(heightOf(grid, 2)).toBe(50);
    expect([0, 1, 3, 4].map((row) => heightOf(grid, row))).toEqual([30, 30, 30, 30]);

    grid.rowGroups.toggle("g:IT");
    expect(heightOf(grid, 6)).toBe(60);
    expect(heightOf(grid, 7)).toBe(50);
  });
});

describe("hierarchy change — frozen rows", () => {
  it("re-resolves a frozen count of 2 over the new rows", async () => {
    const { grid, batches } = createHierarchyGrid(() => createHierarchyFixture(), {
      freezeRows: { count: 2 },
    });
    await grid.initialize();
    grid.setViewport(0, 0, 400, 300);
    expect(grid.frozenRows.get().effectiveCount).toBe(2);
    batches.length = 0;

    grid.rowGroups.toggle("g:IT");

    expect(grid.frozenRows.get().effectiveCount).toBe(2);
    expect(grid.geometry.getRowRegions().frozenExtent).toBe(60);
    const assigned = batches.flat().filter((i): i is AssignSlotInstruction => i.type === "ASSIGN_SLOT");
    expect(assigned.find((i) => i.rowIndex === 1)?.row).toMatchObject({ id: "g:IT", expanded: true });
    expect(assigned.find((i) => i.rowIndex === 2)?.row).toMatchObject({ id: "g:IT:Rome" });
  });
});

describe("hierarchy change — edits and transactions", () => {
  it("commits an open edit before the change", async () => {
    const { grid, batches } = await mountExpanded();
    expect(grid.edit.start(3, 2)).toBe(true);
    grid.edit.updateValue(99);
    batches.length = 0;

    grid.rowGroups.toggle("g:IT:Rome");

    expect(grid.edit.getState()).toBeNull();
    const types = batches.flat().map((i) => i.type);
    expect(types.indexOf("COMMIT_EDIT")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("COMMIT_EDIT")).toBeLessThan(types.indexOf("DATA_LOADED"));
  });

  it("keeps the active record through a transaction refresh", async () => {
    let next = () => createHierarchyFixture({ expanded: ALL });
    const { grid, source } = await mountExpanded(() => next());
    grid.selection.setActiveCell(6, 1);
    const queries = source.queries;

    // Revision 2 drops FR and collapses Rome: r3 moves from row 6 to row 4.
    next = () => createHierarchyFixture({ revision: 2, expanded: ["g:IT", "g:IT:Milan"] });
    await grid.refreshFromTransaction();

    expect(source.queries).toBe(queries + 1);
    expect(grid.rows.getCount()).toBe(5);
    expect(grid.selection.getActiveCell()).toEqual({ row: 4, col: 1 });
    expect(grid.cells.getFieldValue(4, "amount")).toBe(60);
  });

  it("clears the selection when the active record is gone after a transaction", async () => {
    let next = () => createHierarchyFixture({ expanded: ALL });
    const { grid } = await mountExpanded(() => next());
    grid.selection.setActiveCell(9, 0);

    next = () => createHierarchyFixture({ revision: 2, expanded: ALL });
    await grid.refreshFromTransaction();

    expect(grid.selection.getActiveCell()).toBeNull();
  });
});
