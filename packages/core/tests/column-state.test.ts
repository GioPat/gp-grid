// packages/core/tests/column-state.test.ts

import { describe, it, expect, vi, afterEach } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type {
  ColumnDefinition,
  GridInstruction,
  RowId,
} from "../src/types";

interface TestRow {
  id: RowId;
  a: string;
  b: string;
  c: string;
}

const rows = (): TestRow[] => [
  { id: 1, a: "a1", b: "b1", c: "c1" },
  { id: 2, a: "a2", b: "b2", c: "c2" },
  { id: "1", a: "a3", b: "b3", c: "c3" },
];

const def = (
  field: string,
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width: 100,
  ...extra,
});

const ids = (grid: GridCore<TestRow>): string[] =>
  grid.getColumns().map((column) => column.colId ?? column.field);

const createGrid = (
  columns: ColumnDefinition[],
  extra: {
    data?: TestRow[];
    getRowId?: (row: TestRow) => RowId;
    onCellValueChanged?: (event: unknown) => void;
  } = {},
): GridCore<TestRow> =>
  new GridCore<TestRow>({
    columns,
    dataSource: createClientDataSource(extra.data ?? rows()),
    rowHeight: 32,
    headerHeight: 32,
    overscan: 2,
    getRowId: extra.getRowId,
    onCellValueChanged: extra.onCellValueChanged as never,
  });

const collect = (grid: GridCore<TestRow>): GridInstruction[] => {
  const instructions: GridInstruction[] = [];
  grid.onBatchInstruction((batch) => instructions.push(...batch));
  return instructions;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GridCore column state", () => {
  it("replaces [a,b] with [b,c] keeping b's user width and dropping a's header", async () => {
    const grid = createGrid([def("a"), def("b")]);
    const instructions = collect(grid);
    await grid.initialize();

    grid.setColumnWidth(1, 180);
    const storedWidth = grid.getColumnState()[1]?.width;
    expect(storedWidth).not.toBe(100);
    expect(grid.getColumnState()[1]).toMatchObject({
      columnId: "b",
      hidden: false,
      order: 1,
    });

    instructions.length = 0;
    grid.setColumns([def("b"), def("c")]);

    expect(ids(grid)).toEqual(["b", "c"]);
    // `b` keeps its exact override; `c` keeps its definition width because
    // the core has no measured viewport in this test.
    expect(grid.getColumnState()).toEqual([
      {
        columnId: "b",
        width: storedWidth,
        resolvedWidth: 180,
        hidden: false,
        order: 0,
        pinned: null,
        region: "center",
      },
      {
        columnId: "c",
        resolvedWidth: 100,
        hidden: false,
        order: 1,
        pinned: null,
        region: "center",
      },
    ]);

    const removed = instructions.filter((i) => i.type === "REMOVE_HEADERS");
    expect(removed).toEqual([{ type: "REMOVE_HEADERS", columnIds: ["a"] }]);
    const changed = instructions.find((i) => i.type === "COLUMNS_CHANGED");
    expect(changed && changed.type === "COLUMNS_CHANGED"
      ? changed.columns.map((c) => c.field)
      : []).toEqual(["b", "c"]);
  });

  it("resizes and reorders a frozen caller definition array without mutation", () => {
    const frozen = Object.freeze([
      Object.freeze(def("a", { width: 120 })),
      Object.freeze(def("b", { width: 80 })),
    ]);
    const grid = createGrid(frozen as unknown as ColumnDefinition[]);

    expect(() => grid.setColumnWidth(0, 200)).not.toThrow();
    expect(() => grid.moveColumn(0, 2)).not.toThrow();
    expect(frozen[0]?.width).toBe(120);
    expect(frozen[1]?.width).toBe(80);
    expect(ids(grid)).toEqual(["b", "a"]);
  });

  it("emits object-shaped resize and move events with column identity", () => {
    const onColumnResized = vi.fn();
    const onColumnMoved = vi.fn();
    const grid = new GridCore<TestRow>({
      columns: [def("a"), def("b"), def("c")],
      dataSource: createClientDataSource(rows()),
      rowHeight: 32,
      onColumnResized,
      onColumnMoved,
    });

    grid.setColumnWidth(1, 150);
    expect(onColumnResized).toHaveBeenCalledWith({
      columnId: "b",
      width: 150,
      viewIndex: 1,
    });

    grid.moveColumn(0, 2);
    expect(onColumnMoved).toHaveBeenCalledWith({
      columnId: "a",
      fromViewIndex: 0,
      toViewIndex: 1,
    });
  });

  it("lets an explicit state command beat retained user state", () => {
    const grid = createGrid([def("a")]);
    grid.setColumnWidth(0, 150);

    grid.setColumnState([{ columnId: "a", width: 250 }]);
    expect(grid.getColumnState()[0]?.width).toBe(250);

    grid.resetColumnState(["a"]);
    expect(grid.getColumnState()[0]?.width).toBeUndefined();
    // Without a measured viewport the definition width is used as-is.
    expect(grid.getColumnState()[0]?.resolvedWidth).toBe(100);
  });

  it("diagnoses a duplicate column id once and keeps the first definition", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const grid = createGrid([def("a", { colId: "x" }), def("b", { colId: "x" })]);

    expect(ids(grid)).toEqual(["x"]);
    expect(grid.getColumns()[0]?.field).toBe("a");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[gp-grid] Duplicate column id "x"');
  });

  it("reconciles sort and filter when their column disappears", async () => {
    const grid = createGrid([def("a"), def("b")]);
    const instructions = collect(grid);
    await grid.initialize();

    await grid.setSort("b", "asc");
    await grid.setFilter("b", "b1");
    expect(grid.getSortModel()).toEqual([{ colId: "b", direction: "asc" }]);
    expect(grid.hasActiveFilter("b")).toBe(true);

    instructions.length = 0;
    grid.setColumns([def("a")]);

    expect(grid.getSortModel()).toEqual([]);
    expect(grid.getFilterModel()).toEqual({});
    const removed = instructions.filter((i) => i.type === "REMOVE_HEADERS");
    expect(removed).toEqual([{ type: "REMOVE_HEADERS", columnIds: ["b"] }]);
  });

  it("cancels an edit whose column is removed", async () => {
    const grid = createGrid([def("a"), def("b", { editable: true })]);
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    expect(grid.startEdit(0, 1)).toBe(true);
    expect(grid.getEditState()).not.toBeNull();

    grid.setColumns([def("a")]);
    expect(grid.getEditState()).toBeNull();
  });

  it("moves the active cell with its column identity", () => {
    const grid = createGrid([def("a"), def("b"), def("c")]);
    grid.selection.setActiveCell(0, 2);
    grid.selection.setSelectionRange({
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 2,
    });

    // Retained ids keep their relative order, so c moves from 2 to 1.
    grid.setColumns([def("a"), def("c")]);

    expect(ids(grid)).toEqual(["a", "c"]);
    expect(grid.selection.getActiveCell()).toEqual({ row: 0, col: 1 });
    expect(grid.selection.getSelectionRange()).toBeNull();
  });

  it("keeps the selection range when a replacement keeps ids and order", () => {
    const grid = createGrid([def("a"), def("b")]);
    const range = { startRow: 0, startCol: 0, endRow: 1, endCol: 1 };
    grid.selection.setActiveCell(0, 0);
    grid.selection.setSelectionRange(range);

    grid.setColumns([def("a", { headerName: "A" }), def("b")]);

    expect(grid.selection.getSelectionRange()).toEqual(range);
  });

  it("clears the active cell when its column is gone", () => {
    const grid = createGrid([def("a"), def("b")]);
    grid.selection.setActiveCell(0, 1);
    grid.setColumns([def("a")]);
    expect(grid.selection.getActiveCell()).toBeNull();
  });

  it("keeps unrelated scroll and resident rows across a replacement", async () => {
    const grid = createGrid([def("a"), def("b")]);
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);
    const beforeRange = grid.getVisibleRowRange();
    const beforeRows = grid.getRowCount();
    const beforeRow = grid.getRowData(1);

    grid.setColumns([def("b"), def("c")]);

    expect(grid.getVisibleRowRange()).toEqual(beforeRange);
    expect(grid.getRowCount()).toBe(beforeRows);
    expect(grid.getRowData(1)).toBe(beforeRow);
  });

  it("distinguishes numeric and string row ids and answers getRecordById", async () => {
    const grid = createGrid([def("a")], {
      getRowId: (row) => row.id,
      onCellValueChanged: vi.fn(),
    });
    await grid.initialize();

    expect(grid.getRowId(0)).toBe(1);
    expect(grid.getRowId(2)).toBe("1");
    expect(grid.getViewRow(0)).toMatchObject({
      kind: "record",
      id: 1,
      viewIndex: 0,
    });
    expect(grid.getRecordById(1)).toBe(grid.getRowData(0));
    expect(grid.getRecordById("1")).toBe(grid.getRowData(2));
    expect(grid.getRecordById(99)).toBeUndefined();
    expect(grid.getViewRow(99)).toBeUndefined();
  });

  it("falls back to the view index as identity without getRowId", async () => {
    const grid = createGrid([def("a")]);
    await grid.initialize();

    expect(grid.getViewRow(1)).toEqual({
      kind: "record",
      id: 1,
      viewIndex: 1,
      record: grid.getRowData(1),
    });
  });

  it("diagnoses a duplicate row id among resident rows", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const grid = createGrid([def("a")], { getRowId: () => 1 });
    await grid.initialize();

    expect(warn).toHaveBeenCalledWith("[gp-grid] Duplicate row id 1");
    expect(grid.getRowId(0)).toBe(1);
  });

  it("ignores a commit tagged with a superseded slot generation", async () => {
    const onCellValueChanged = vi.fn();
    const data = Array.from({ length: 1_000 }, (_, index) => ({
      id: index,
      a: `a${index}`,
      b: "",
      c: "",
    }));
    const grid = createGrid([def("a", { editable: true })], {
      data,
      getRowId: (row) => row.id,
      onCellValueChanged,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    expect(grid.startEdit(0, 0)).toBe(true);
    const generation = grid.getSlotGeneration(0);
    expect(generation).toBeGreaterThanOrEqual(0);
    expect(grid.isSlotGenerationCurrent(0, generation)).toBe(true);

    // Scroll far enough that row 0 loses its slot; a callback captured at the
    // old generation is no longer current.
    grid.setViewport(10_000, 0, 800, 400);
    expect(grid.getSlotGeneration(0)).toBe(-1);
    expect(grid.isSlotGenerationCurrent(0, generation)).toBe(false);

    grid.commitEdit();
    expect(onCellValueChanged).not.toHaveBeenCalled();
    expect(grid.getEditState()).toBeNull();
  });

  it("exposes the slot generation on assigned slot data", async () => {
    const grid = createGrid([def("a")]);
    const instructions = collect(grid);
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    const assigned = instructions.filter((i) => i.type === "ASSIGN_SLOT");
    expect(assigned.length).toBeGreaterThan(0);
    for (const instruction of assigned) {
      if (instruction.type === "ASSIGN_SLOT") {
        expect(grid.getSlotGeneration(instruction.rowIndex)).toBe(
          instruction.generation,
        );
      }
    }
  });
});

describe("GridCore edit survival across slot refreshes", () => {
  const editableColumns = (): ColumnDefinition[] => [
    def("a", { editable: true }),
    def("b", { editable: true }),
  ];

  it("commits an edit that followed its column through a replacement", async () => {
    const data = rows();
    const onCellValueChanged = vi.fn();
    const grid = createGrid(editableColumns(), {
      data,
      getRowId: (row) => row.id,
      onCellValueChanged,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    expect(grid.startEdit(0, 1)).toBe(true);
    grid.updateEditValue("typed");
    grid.setColumns([def("b", { editable: true }), def("a", { editable: true })]);
    expect(grid.getEditState()).toMatchObject({ row: 0, col: 0, currentValue: "typed" });

    grid.commitEdit();
    expect(data[0]?.b).toBe("typed");
    expect(onCellValueChanged).toHaveBeenCalledTimes(1);
    expect(onCellValueChanged).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: 1, columnId: "b", newValue: "typed" }),
    );
  });

  it("commits an edit started before a data refresh of the same row", async () => {
    const data = rows();
    const onCellValueChanged = vi.fn();
    const grid = createGrid(editableColumns(), {
      data,
      getRowId: (row) => row.id,
      onCellValueChanged,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    expect(grid.startEdit(1, 0)).toBe(true);
    grid.updateEditValue("typed");
    await grid.refresh();

    grid.commitEdit();
    expect(data[1]?.a).toBe("typed");
    expect(onCellValueChanged).toHaveBeenCalledTimes(1);
  });
});

describe("GridCore definition changes on retained ids", () => {
  it("publishes replaced definitions even when id, width and visibility are unchanged", async () => {
    const grid = createGrid([def("a", { headerName: "Old" })]);
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);
    const instructions = collect(grid);

    grid.setColumns([def("a", { headerName: "New", editable: true })]);

    const published = instructions.filter((i) => i.type === "COLUMNS_CHANGED");
    expect(published).toHaveLength(1);
    const column = published[0]?.type === "COLUMNS_CHANGED" ? published[0].columns[0] : undefined;
    expect(column).toMatchObject({ headerName: "New", editable: true });
  });
});

describe("GridCore identity through column-state commands", () => {
  const editable = (): ColumnDefinition[] => [
    def("a", { editable: true }),
    def("b", { editable: true }),
  ];

  it("commits into the edited column after an explicit reorder", async () => {
    const data = rows();
    const grid = createGrid(editable(), { data, getRowId: (row) => row.id });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    grid.startEdit(0, 0);
    grid.updateEditValue("typed");
    grid.setColumnState([{ columnId: "a", order: 1 }]);
    expect(grid.getEditState()).toMatchObject({ col: 1, currentValue: "typed" });

    grid.commitEdit();
    expect(data[0]).toMatchObject({ a: "typed", b: "b1" });
  });

  it("re-anchors a moved edit with its draft and the same session", async () => {
    const grid = createGrid(editable(), { getRowId: (row) => row.id });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);
    grid.startEdit(0, 1);
    grid.updateEditValue("typed");
    const editId = grid.getEditState()?.editId;
    const instructions = collect(grid);

    grid.setColumns([def("b", { editable: true }), def("a", { editable: true })]);

    const reanchored = instructions.filter((i) => i.type === "START_EDIT");
    expect(reanchored).toEqual([
      { type: "START_EDIT", row: 0, col: 0, initialValue: "typed", editId },
    ]);
  });

  it("ignores editor callbacks tagged with a closed edit session", async () => {
    const data = rows();
    const grid = createGrid(editable(), { data, getRowId: (row) => row.id });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    grid.startEdit(0, 0);
    const staleId = grid.getEditState()?.editId;
    grid.cancelEdit();
    grid.startEdit(1, 1);
    grid.updateEditValue("current");

    grid.updateEditValue("stale", staleId);
    grid.commitEdit(staleId);
    expect(grid.getEditState()).toMatchObject({ row: 1, col: 1, currentValue: "current" });
    grid.cancelEdit(staleId);
    expect(grid.getEditState()).not.toBeNull();
    expect(data[1]?.b).toBe("b2");
  });

  it("follows a peeked column through a replacement", async () => {
    const grid = createGrid([def("a"), def("b")]);
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);
    expect(grid.startPeek(0, 1)).toBe(true);

    grid.setColumns([def("b"), def("a")]);

    expect(grid.getPeekState()).toEqual({ row: 0, col: 0 });
  });

  it("reports the dragged row's identity, read before the move", async () => {
    const onRowDragEnd = vi.fn();
    const grid = new GridCore<TestRow>({
      columns: [def("a")],
      dataSource: createClientDataSource(rows()),
      rowHeight: 32,
      getRowId: (row) => row.id,
      onRowDragEnd,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);

    grid.commitRowDrag(0, 2);

    expect(onRowDragEnd).toHaveBeenCalledWith(expect.objectContaining({ rowId: 1 }));
  });

  it("keeps the active record when removing a sorted column reorders rows", async () => {
    const data: TestRow[] = [
      { id: 1, a: "a1", b: "z" },
      { id: 2, a: "a2", b: "y" },
      { id: 3, a: "a3", b: "x" },
    ].map((row) => ({ ...row, c: "" }));
    const grid = createGrid([def("a"), def("b")], { data, getRowId: (row) => row.id });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);
    await grid.setSort("b", "asc");
    grid.selection.setActiveCell(0, 0);
    expect(grid.getRowId(0)).toBe(3);

    grid.setColumns([def("a")]);
    await vi.waitFor(() => expect(grid.getRowId(0)).toBe(1));

    const active = grid.selection.getActiveCell();
    expect(active && grid.getRowId(active.row)).toBe(3);
  });

  it("calls a source's getRecordById as a method", async () => {
    class LookupSource {
      private readonly records = new Map<RowId, TestRow>(rows().map((row) => [row.id, row]));
      private readonly inner = createClientDataSource(rows());
      query = this.inner.query.bind(this.inner);
      getRecordById(rowId: RowId): TestRow | undefined {
        return this.records.get(rowId);
      }
    }
    const grid = new GridCore<TestRow>({
      columns: [def("a")],
      dataSource: new LookupSource(),
      rowHeight: 32,
    });
    await grid.initialize();

    expect(grid.getRecordById(2)).toMatchObject({ a: "a2" });
  });

  it("diagnoses a duplicate row id beyond the load-time scan cap once visible", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const data: TestRow[] = Array.from({ length: 10_010 }, (_, index) => ({
      id: index === 10_005 ? 10_004 : index,
      a: "",
      b: "",
      c: "",
    }));
    const grid = createGrid([def("a")], { data, getRowId: (row) => row.id });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 400);
    expect(warn).not.toHaveBeenCalled();

    grid.setViewport(10_000 * 32, 0, 800, 400);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[gp-grid] Duplicate row id 10004");
  });
});
