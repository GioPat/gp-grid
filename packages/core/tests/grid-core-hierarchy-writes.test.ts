// PRD 008 D5/D6: input and writes on group and total rows (AC-008-04).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CellWriteRejectedEvent, HierarchyRecordChange, KeyEventData, PointerEventData } from "../src/types";
import type { GridCoreOptions } from "../src/types";
import {
  createHierarchyFixture,
  createHierarchyGrid,
  type FixtureAccess,
  type FixtureRecord,
} from "./hierarchy-fixture";

// Fully expanded: 0 total, 1 g:IT, 2 g:IT:Rome, 3 r1, 4 r2 (no record), 5 g:IT:Milan,
// 6 r3, 7 g:FR, 8 g:FR:Paris, 9 r4. Columns: country, city, amount (editable).
const ALL = ["g:IT", "g:IT:Rome", "g:IT:Milan", "g:FR", "g:FR:Paris"];
const AMOUNT = 2;

const key = (value: string): KeyEventData => ({
  key: value, shiftKey: false, ctrlKey: false, metaKey: false,
});

const pointer: PointerEventData = {
  clientX: 10, clientY: 10, button: 0, shiftKey: false, ctrlKey: false, metaKey: false,
};

interface Setup {
  expanded?: readonly string[];
  movesRows?: boolean;
  options?: Partial<GridCoreOptions<FixtureRecord>>;
}

const setup = async ({ expanded = ALL, movesRows = false, options = {} }: Setup = {}) => {
  const rejected: CellWriteRejectedEvent[] = [];
  const recordsChanged = vi.fn((_changes: readonly HierarchyRecordChange[]) => movesRows);
  const next = (): FixtureAccess => {
    const access = createHierarchyFixture({ expanded });
    access.recordsChanged = recordsChanged;
    return access;
  };
  const created = createHierarchyGrid(next, {
    onWriteRejected: (event) => rejected.push(event),
    ...options,
  });
  await created.grid.initialize();
  created.grid.setViewport(0, 0, 400, 600);
  created.batches.length = 0;
  return { ...created, rejected, recordsChanged };
};

const amountOf = (grid: Awaited<ReturnType<typeof setup>>["grid"], row: number) =>
  grid.cells.getFieldValue(row, "amount");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hierarchy writes — no editor on group and total rows", () => {
  it("edit.start, F2, Delete and typing open nothing and emit nothing", async () => {
    const { grid, batches, rejected } = await setup();

    for (const row of [0, 1]) {
      expect(grid.edit.start(row, AMOUNT)).toBe(false);
      for (const name of ["F2", "Delete", "Backspace", "7"]) {
        grid.input.handleKeyDown(key(name), { row, col: AMOUNT }, null, false);
      }
    }

    expect(grid.edit.getState()).toBeNull();
    expect(batches).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("still opens an editor on a record row", async () => {
    const { grid } = await setup();
    expect(grid.edit.start(3, AMOUNT)).toBe(true);
  });

  it("opens no peek on a group or total cell without an aggregate", async () => {
    const { grid } = await setup();
    const CITY = 1;
    expect(grid.edit.startPeek(0, CITY)).toBe(false);
    expect(grid.edit.startPeek(1, CITY)).toBe(false);
    expect(grid.edit.startPeek(1, AMOUNT)).toBe(true);
    grid.edit.stopPeek();
    expect(grid.edit.startPeek(3, CITY)).toBe(true);
  });
});

describe("hierarchy writes — toggles (D5)", () => {
  it("Enter and Space toggle a group row as a gesture", async () => {
    const onRowGroupToggled = vi.fn();
    const { grid } = await setup({ expanded: [], options: { onRowGroupToggled } });
    expect(grid.rows.getCount()).toBe(3);

    const enter = grid.input.handleKeyDown(key("Enter"), { row: 1, col: 0 }, null, false);
    expect(enter.preventDefault).toBe(true);
    expect(grid.rows.getCount()).toBe(5);
    expect(grid.edit.getState()).toBeNull();

    grid.input.handleKeyDown(key(" "), { row: 1, col: AMOUNT }, null, false);
    expect(grid.rows.getCount()).toBe(3);
    expect(onRowGroupToggled.mock.calls).toEqual([
      [{ rowId: "g:IT", expanded: true }],
      [{ rowId: "g:IT", expanded: false }],
    ]);
  });

  it("Enter on the total row toggles nothing", async () => {
    const onRowGroupToggled = vi.fn();
    const { grid } = await setup({ expanded: [], options: { onRowGroupToggled } });
    grid.input.handleKeyDown(key("Enter"), { row: 0, col: AMOUNT }, null, false);
    expect(grid.rows.getCount()).toBe(3);
    expect(onRowGroupToggled).not.toHaveBeenCalled();
  });

  it("a double-click and the expander toggle a group row", async () => {
    const onRowGroupToggled = vi.fn();
    const { grid } = await setup({ expanded: [], options: { onRowGroupToggled } });

    grid.input.handleCellDoubleClick(2, AMOUNT);
    expect(grid.rows.getCount()).toBe(4);
    expect(grid.edit.getState()).toBeNull();

    expect(grid.input.handleGroupToggle(2)).toEqual({ status: "applied" });
    expect(grid.rows.getCount()).toBe(3);
    grid.input.handleCellDoubleClick(0, 0);
    expect(grid.rows.getCount()).toBe(3);
    expect(onRowGroupToggled).toHaveBeenCalledTimes(2);
  });
});

describe("hierarchy writes — paste, fill and setValue (D6)", () => {
  it("a paste writes record rows, skips group rows and calls recordsChanged once", async () => {
    const { grid, rejected, recordsChanged } = await setup();
    grid.selection.setActiveCell(5, AMOUNT);

    expect(grid.edit.paste("1\n2\n3\n4\n5")).toBe(true);

    expect(amountOf(grid, 6)).toBe(2);
    expect(amountOf(grid, 9)).toBe(5);
    expect(rejected.map(({ row, reason, operation }) => [row, reason, operation])).toEqual([
      [5, "not-a-record", "paste"],
      [7, "not-a-record", "paste"],
      [8, "not-a-record", "paste"],
    ]);
    expect(recordsChanged).toHaveBeenCalledExactlyOnceWith([
      { viewRow: 6, field: "amount" },
      { viewRow: 9, field: "amount" },
    ]);
  });

  it("a fill writes record rows, skips group rows and calls recordsChanged once", async () => {
    const { grid, rejected, recordsChanged, batches } = await setup();
    grid.fill.startFillDrag({ startRow: 6, startCol: AMOUNT, endRow: 6, endCol: AMOUNT });
    grid.fill.updateFillDrag(9, AMOUNT);
    grid.fill.commitFillDrag();

    expect(amountOf(grid, 9)).toBe(30);
    expect(rejected.map(({ row, reason }) => [row, reason])).toEqual([
      [7, "not-a-record"],
      [8, "not-a-record"],
    ]);
    expect(recordsChanged).toHaveBeenCalledExactlyOnceWith([{ viewRow: 9, field: "amount" }]);
    const commit = batches.flat().find((i) => i.type === "COMMIT_FILL");
    expect(commit).toEqual({ type: "COMMIT_FILL", filledCells: [{ row: 9, col: AMOUNT, value: 30 }] });
  });

  it("a record row without a record is skipped too", async () => {
    const { grid, rejected, recordsChanged } = await setup();
    grid.selection.setActiveCell(4, AMOUNT);
    expect(grid.edit.paste("9")).toBe(true);
    expect(rejected).toMatchObject([{ row: 4, reason: "not-a-record" }]);
    expect(recordsChanged).not.toHaveBeenCalled();
  });

  it("cells.setValue rejects a group row and reports a record write once", async () => {
    const { grid, rejected, recordsChanged } = await setup();

    grid.cells.setValue(1, AMOUNT, 5);
    expect(rejected).toEqual([
      { row: 1, col: AMOUNT, field: "amount", reason: "not-a-record", operation: "setCellValue" },
    ]);
    expect(recordsChanged).not.toHaveBeenCalled();

    grid.cells.setValue(3, AMOUNT, 99);
    expect(amountOf(grid, 3)).toBe(99);
    expect(recordsChanged).toHaveBeenCalledExactlyOnceWith([{ viewRow: 3, field: "amount" }]);
  });

  it("an edit commit reports its record once and fires onCellValueChanged by id", async () => {
    const onCellValueChanged = vi.fn();
    const { grid, recordsChanged } = await setup({
      options: { onCellValueChanged, getRowId: (row) => row.id },
    });
    grid.edit.start(6, AMOUNT);
    grid.edit.updateValue(77);
    grid.edit.commit();

    expect(amountOf(grid, 6)).toBe(77);
    expect(recordsChanged).toHaveBeenCalledExactlyOnceWith([{ viewRow: 6, field: "amount" }]);
    expect(onCellValueChanged).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: "r3", field: "amount", oldValue: 30, newValue: 77 }),
    );
  });

  it("re-publishes the view rows when recordsChanged reports a move", async () => {
    const { grid, batches } = await setup({ movesRows: true });
    grid.selection.setActiveCell(6, AMOUNT);
    batches.length = 0;

    grid.cells.setValue(6, AMOUNT, 1);

    const types = batches.flat().map((i) => i.type);
    expect(types).toContain("DATA_LOADED");
    expect(grid.selection.getActiveCell()).toEqual({ row: 6, col: AMOUNT });
  });

  it("refreshes the mounted slots when no row moved", async () => {
    const { grid, batches } = await setup();
    grid.cells.setValue(6, AMOUNT, 1);
    const types = batches.flat().map((i) => i.type);
    expect(types).not.toContain("DATA_LOADED");
    expect(types).toContain("ASSIGN_SLOT");
  });
});

describe("hierarchy writes — row drag and copy", () => {
  it("no row drag starts and a commit reports a derived view", async () => {
    const onRowDragEnd = vi.fn();
    const { grid, rejected } = await setup({ options: { rowDragEntireRow: true, onRowDragEnd } });

    const result = grid.input.handleCellMouseDown(3, 0, pointer);
    expect(result.startDrag).toBe("selection");

    grid.rowDrag.commit(3, 6);
    expect(rejected).toEqual([
      { row: 3, col: -1, field: "", reason: "derived-view", operation: "row-move" },
    ]);
    expect(onRowDragEnd).not.toHaveBeenCalled();
  });

  it("copy includes the aggregate values of group and total rows", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { grid } = await setup();
    grid.selection.startSelection({ row: 0, col: AMOUNT });
    grid.selection.startSelection({ row: 3, col: AMOUNT }, { shift: true });

    await grid.selection.copySelectionToClipboard();

    expect(writeText).toHaveBeenCalledWith("100\n60\n30\n10");
  });
});
