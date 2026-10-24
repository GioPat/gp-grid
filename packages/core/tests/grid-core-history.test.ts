// PRD 013 D3/D4/D5: undo and redo over the write commands through GridCore (AC-013-03..06).

import { describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource, createMutableClientDataSource } from "../src/data-source";
import { createRowGrouping } from "../src/row-grouping";
import type {
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  GridCoreOptions,
  HistoryOptions,
  KeyEventData,
  WriteCommittedEvent,
} from "../src/types";

interface Row {
  id: number;
  name: string;
  amount: number;
  note: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 60 },
  { field: "name", cellDataType: "text", width: 100, editable: true },
  { field: "amount", cellDataType: "number", width: 100, editable: true },
  { field: "note", colId: "memo", cellDataType: "text", width: 100, editable: true },
];
const NAME = 1;
const AMOUNT = 2;
const NOTE = 3;

const rowsOf = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `n${i + 1}`, amount: i * 10, note: "" }));

interface Mount {
  options?: Partial<GridCoreOptions<Row>>;
  /** `null` mounts without the option. */
  history?: HistoryOptions | null;
}

const mount = async ({ options = {}, history = { maxEntries: 10 } }: Mount = {}) => {
  const rows = rowsOf(5);
  const source = createMutableClientDataSource(rows, { getRowId: (row) => row.id, debounceMs: 0, useWorker: false });
  let writable = true;
  const dataSource: DataSource<Row> = {
    ...source,
    get writable() {
      return writable;
    },
  };
  const committed: WriteCommittedEvent[] = [];
  const rejected: CellWriteRejectedEvent[] = [];
  const changed: CellValueChangedEvent<Row>[] = [];
  const grid = new GridCore<Row>({
    columns,
    dataSource,
    rowHeight: 30,
    headerHeight: 30,
    getRowId: (row) => row.id,
    history: history ?? undefined,
    onWriteCommitted: (event) => committed.push(event),
    onWriteRejected: (event) => rejected.push(event),
    onCellValueChanged: (event) => changed.push(event),
    ...options,
  });
  await grid.initialize();
  grid.setViewport(0, 0, 400, 600);
  const setWritable = (next: boolean): void => {
    writable = next;
  };
  return { grid, rows, source, committed, rejected, changed, setWritable };
};

type Grid = Awaited<ReturnType<typeof mount>>["grid"];

const edit = (grid: Grid, row: number, col: number, draft: string): void => {
  expect(grid.edit.start(row, col)).toBe(true);
  grid.edit.updateValue(draft);
  grid.edit.commit();
};

const key = (value: string, extra: Partial<KeyEventData> = {}): KeyEventData => ({
  key: value, shiftKey: false, ctrlKey: false, metaKey: false, ...extra,
});

const viewAmounts = (grid: Grid): unknown[] =>
  Array.from({ length: grid.rows.getCount() }, (_, row) => grid.cells.getFieldValue(row, "amount"));

describe("history — one command, one step (D4)", () => {
  it("an edit undoes and redoes as a write command", async () => {
    const { grid, rows, committed, changed } = await mount();
    edit(grid, 0, AMOUNT, "12");
    expect(rows[0]?.amount).toBe(12);
    expect(grid.history.canUndo()).toBe(true);
    changed.length = 0;

    expect(grid.history.undo()).toBe(true);

    expect(rows[0]?.amount).toBe(0);
    expect(grid.history.canUndo()).toBe(false);
    expect(grid.history.canRedo()).toBe(true);
    expect(changed.map(({ rowId, field, oldValue, newValue, colIndex }) => [rowId, field, oldValue, newValue, colIndex]))
      .toEqual([[1, "amount", 12, 0, AMOUNT]]);
    expect(committed.at(-1)).toEqual({
      operation: "undo",
      changes: [{ rowId: 1, columnId: "amount", field: "amount", oldValue: 12, newValue: 0 }],
      skipped: [],
    });

    expect(grid.history.redo()).toBe(true);
    expect(rows[0]?.amount).toBe(12);
    expect(committed.at(-1)?.operation).toBe("redo");
    expect(grid.history.canRedo()).toBe(false);
  });

  it("a 2×2 paste undoes in one step, in reverse order", async () => {
    const { grid, rows, changed, committed } = await mount();
    grid.selection.setActiveCell(0, NAME);
    expect(grid.edit.paste("a\t7\nc\t8")).toBe(true);
    changed.length = 0;

    expect(grid.history.undo()).toBe(true);

    expect(changed.map(({ rowId, field }) => [rowId, field])).toEqual([
      [2, "amount"], [2, "name"], [1, "amount"], [1, "name"],
    ]);
    expect(rows.slice(0, 2)).toEqual([{ id: 1, name: "n1", amount: 0, note: "" }, { id: 2, name: "n2", amount: 10, note: "" }]);
    expect(committed.at(-1)?.changes).toHaveLength(4);
    expect(grid.history.canUndo()).toBe(false);
  });

  it("a fill undoes in one step", async () => {
    const { grid, rows } = await mount();
    grid.fill.startFillDrag({ startRow: 0, startCol: AMOUNT, endRow: 0, endCol: AMOUNT });
    grid.fill.updateFillDrag(2, AMOUNT);
    grid.fill.commitFillDrag();
    expect(rows.map((row) => row.amount)).toEqual([0, 0, 0, 30, 40]);

    expect(grid.history.undo()).toBe(true);
    expect(rows.map((row) => row.amount)).toEqual([0, 10, 20, 30, 40]);
  });

  it("a new command after an undo clears redo; maxEntries evicts the oldest", async () => {
    const { grid, rows } = await mount({ history: { maxEntries: 2 } });
    edit(grid, 0, AMOUNT, "1");
    grid.history.undo();
    edit(grid, 1, AMOUNT, "2");
    expect(grid.history.canRedo()).toBe(false);
    expect(grid.history.redo()).toBe(false);

    edit(grid, 2, AMOUNT, "3");
    edit(grid, 3, AMOUNT, "4");
    expect(grid.history.undo()).toBe(true);
    expect(grid.history.undo()).toBe(true);
    expect(grid.history.undo()).toBe(false);
    expect(rows.map((row) => row.amount)).toEqual([0, 2, 20, 30, 40]);
  });

  it("without history nothing is recorded and the keys reach the browser", async () => {
    const { grid, rows } = await mount({ history: null });
    edit(grid, 0, AMOUNT, "12");

    expect(grid.history.isEnabled()).toBe(false);
    expect(grid.history.canUndo()).toBe(false);
    expect(grid.history.undo()).toBe(false);
    expect(grid.input.handleKeyDown(key("z", { ctrlKey: true }), { row: 0, col: AMOUNT }, null, false))
      .toEqual({ preventDefault: false });
    expect(rows[0]?.amount).toBe(12);
  });

  it("setDataSource clears the history", async () => {
    const { grid } = await mount();
    edit(grid, 0, AMOUNT, "12");
    await grid.setDataSource(createClientDataSource(rowsOf(3), { useWorker: false }));
    expect(grid.history.canUndo()).toBe(false);
  });

  it("history without getRowId throws; a non-positive bound throws", () => {
    const dataSource = createClientDataSource(rowsOf(1), { useWorker: false });
    expect(() => new GridCore<Row>({ columns, dataSource, rowHeight: 30, history: {} }))
      .toThrow("getRowId is required when history is provided");
    expect(() => new GridCore<Row>({ columns, dataSource, rowHeight: 30, getRowId: (row) => row.id, history: { maxEntries: 0 } }))
      .toThrow(new RangeError("Invalid history.maxEntries: 0"));
  });
});

describe("history — by record id (D3)", () => {
  it("after a sort the record is found by id and the view is not re-queried", async () => {
    const { grid, rows } = await mount();
    edit(grid, 0, AMOUNT, "-5");
    await grid.sortFilter.setSort("amount", "desc");
    expect(grid.rows.getId(4)).toBe(1);

    expect(grid.history.undo()).toBe(true);

    expect(rows[0]?.amount).toBe(0);
    expect(viewAmounts(grid)).toEqual([40, 30, 20, 10, 0]);
    expect(grid.rows.getId(4)).toBe(1);
  });

  it("after a filter hides the record it is still written, through the source", async () => {
    const { grid, rows, committed } = await mount();
    edit(grid, 0, NAME, "zzz");
    await grid.sortFilter.setFilter("name", "n");
    expect(grid.rows.getCount()).toBe(4);

    expect(grid.history.undo()).toBe(true);

    expect(rows[0]?.name).toBe("n1");
    expect(committed.at(-1)?.operation).toBe("undo");
    expect(grid.rows.getCount()).toBe(4);
  });

  it("a field whose column left the grid is still written, with colIndex -1", async () => {
    const { grid, rows, changed } = await mount();
    edit(grid, 0, NOTE, "k");
    grid.columns.set(columns.slice(0, 3));
    changed.length = 0;

    expect(grid.history.undo()).toBe(true);

    expect(rows[0]?.note).toBe("");
    expect(changed).toMatchObject([{ rowId: 1, columnId: "memo", field: "note", colIndex: -1 }]);
  });
});

describe("history — refused entries (AC-013-04, AC-013-06)", () => {
  it("a changed cell refuses the whole entry, drops it and reports once", async () => {
    const { grid, rows, source, rejected, committed } = await mount();
    grid.selection.setActiveCell(0, NAME);
    expect(grid.edit.paste("a\t7")).toBe(true);
    source.updateCell(1, "amount", 55);
    await source.flushTransactions();
    const events = committed.length;

    expect(grid.history.undo()).toBe(false);

    expect(rows[0]).toEqual({ id: 1, name: "a", amount: 55, note: "" });
    expect(rejected).toEqual([{ row: 0, col: AMOUNT, field: "amount", reason: "conflict", operation: "undo" }]);
    expect(grid.history.canUndo()).toBe(false);
    expect(committed).toHaveLength(events);
  });

  it("a removed record reports missing-record with no view row", async () => {
    const { grid, source, rejected } = await mount();
    edit(grid, 0, NAME, "x");
    source.removeRows([1]);
    await source.flushTransactions();
    await grid.refreshFromTransaction();

    expect(grid.history.undo()).toBe(false);
    expect(rejected).toEqual([{ row: -1, col: NAME, field: "name", reason: "missing-record", operation: "undo" }]);
  });

  it("a read-only source refuses undo and redo like any write", async () => {
    const { grid, rows, rejected, setWritable } = await mount();
    edit(grid, 0, NAME, "x");
    setWritable(false);

    expect(grid.history.undo()).toBe(false);
    expect(rows[0]?.name).toBe("x");
    expect(rejected).toEqual([{ row: 0, col: NAME, field: "name", reason: "read-only-source", operation: "undo" }]);
  });

  it("a redo checks the cell holds the undone value", async () => {
    const { grid, rows, source, rejected } = await mount();
    edit(grid, 0, AMOUNT, "12");
    grid.history.undo();
    source.updateCell(1, "amount", 3);
    await source.flushTransactions();

    expect(grid.history.redo()).toBe(false);
    expect(rows[0]?.amount).toBe(3);
    expect(rejected).toMatchObject([{ reason: "conflict", operation: "redo" }]);
    expect(grid.history.canRedo()).toBe(false);
  });
});

describe("history — the keys (D5)", () => {
  const active = { row: 0, col: AMOUNT };

  it("Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo, Meta counts as Ctrl", async () => {
    const { grid, rows } = await mount();
    edit(grid, 0, AMOUNT, "12");

    expect(grid.input.handleKeyDown(key("z", { ctrlKey: true }), active, null, false)).toEqual({ preventDefault: true });
    expect(rows[0]?.amount).toBe(0);
    expect(grid.input.handleKeyDown(key("y", { ctrlKey: true }), active, null, false)).toEqual({ preventDefault: true });
    expect(rows[0]?.amount).toBe(12);
    expect(grid.input.handleKeyDown(key("z", { metaKey: true }), active, null, false)).toEqual({ preventDefault: true });
    expect(rows[0]?.amount).toBe(0);
    expect(grid.input.handleKeyDown(key("Z", { ctrlKey: true, shiftKey: true }), active, null, false)).toEqual({ preventDefault: true });
    expect(rows[0]?.amount).toBe(12);
  });

  it("an empty stack still takes the key; an open editor keeps it", async () => {
    const { grid, rows } = await mount();
    expect(grid.input.handleKeyDown(key("z", { ctrlKey: true }), active, null, false)).toEqual({ preventDefault: true });

    edit(grid, 0, AMOUNT, "12");
    expect(grid.edit.start(0, NAME)).toBe(true);
    expect(grid.input.handleKeyDown(key("z", { ctrlKey: true }), active, active, false)).toEqual({ preventDefault: false });
    expect(rows[0]?.amount).toBe(12);
  });
});

describe("history — under row grouping (AC-013-06)", () => {
  interface Sale {
    id: number;
    country: string;
    amount: number;
  }

  const mountGrouped = async () => {
    const sales: Sale[] = [
      { id: 1, country: "IT", amount: 10 },
      { id: 2, country: "IT", amount: 30 },
      { id: 3, country: "FR", amount: 5 },
    ];
    const source = createMutableClientDataSource(sales, { getRowId: (row) => row.id, debounceMs: 0, useWorker: false });
    const grid = new GridCore<Sale>({
      columns: [
        { field: "country", cellDataType: "text", width: 100 },
        { field: "amount", cellDataType: "number", width: 100, editable: true },
      ],
      dataSource: source,
      rowHeight: 30,
      headerHeight: 30,
      getRowId: (row) => row.id,
      history: {},
      rowGrouping: createRowGrouping({
        dimensions: [{ field: "country" }],
        measures: [{ field: "sum", source: "amount", aggregate: "sum" }],
        grandTotal: "top",
      }),
    });
    await grid.initialize();
    grid.setViewport(0, 0, 400, 600);
    grid.rowGroups.setExpanded(null, true);
    const rowOf = (id: number): number =>
      Array.from({ length: grid.rows.getCount() }, (_, i) => grid.rows.getViewRow(i))
        .findIndex((row) => row?.kind === "record" && row.id === id);
    return { grid, sales, rowOf };
  };

  it("an undo of a measure edit refolds the group through recordsChanged", async () => {
    const { grid, sales, rowOf } = await mountGrouped();
    edit(grid, rowOf(1), 1, "100");
    expect(grid.cells.getFieldValue(0, "sum")).toBe(135);

    expect(grid.history.undo()).toBe(true);

    expect(sales[0]?.amount).toBe(10);
    expect(grid.cells.getFieldValue(0, "sum")).toBe(45);
  });

  it("an undo whose record sits under a collapsed group reloads the view", async () => {
    const { grid, sales, rowOf } = await mountGrouped();
    edit(grid, rowOf(1), 1, "100");
    const italy = grid.rows.getViewRow(rowOf(1) - 1);
    expect(italy?.kind).toBe("group");
    grid.rowGroups.setExpanded([italy!.id], false);
    expect(rowOf(1)).toBe(-1);

    expect(grid.history.undo()).toBe(true);

    expect(sales[0]?.amount).toBe(10);
    await vi.waitFor(() => expect(grid.cells.getFieldValue(0, "sum")).toBe(45));
    expect(rowOf(1)).toBe(-1);
  });
});
