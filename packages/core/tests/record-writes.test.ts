// PRD 013 D1/D2: one write command, one onWriteCommitted (AC-013-01, AC-013-02).

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type {
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  GridCoreOptions,
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
const ID = 0;
const NAME = 1;
const AMOUNT = 2;
const NOTE = 3;

const rowsOf = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `n${i + 1}`, amount: i * 10, note: "" }));

interface Mount {
  options?: Partial<GridCoreOptions<Row>>;
  writable?: boolean;
}

const mount = async ({ options = {}, writable = true }: Mount = {}) => {
  const rows = rowsOf(5);
  const committed: WriteCommittedEvent[] = [];
  const rejected: CellWriteRejectedEvent[] = [];
  const inner = createClientDataSource(rows, { useWorker: false });
  const dataSource: DataSource<Row> = writable ? inner : { ...inner, writable: false };
  const grid = new GridCore<Row>({
    columns,
    dataSource,
    rowHeight: 30,
    headerHeight: 30,
    getRowId: (row) => row.id,
    onWriteCommitted: (event) => committed.push(event),
    onWriteRejected: (event) => rejected.push(event),
    ...options,
  });
  await grid.initialize();
  grid.setViewport(0, 0, 400, 600);
  return { grid, rows, committed, rejected };
};

const change = (rowId: number, columnId: string, field: string, oldValue: unknown, newValue: unknown) =>
  ({ rowId, columnId, field, oldValue, newValue });

describe("write commands — one event per command (D1)", () => {
  it("a paste is one event with its changes in write order", async () => {
    const { grid, committed, rejected } = await mount();
    grid.selection.setActiveCell(0, NAME);

    expect(grid.edit.paste("a\t7\nc\t8")).toBe(true);

    expect(committed).toEqual([{
      operation: "paste",
      changes: [
        change(1, "name", "name", "n1", "a"),
        change(1, "amount", "amount", 0, 7),
        change(2, "name", "name", "n2", "c"),
        change(2, "amount", "amount", 10, 8),
      ],
      skipped: [],
    }]);
    expect(rejected).toEqual([]);
  });

  it("an editor commit is one event with one change", async () => {
    const { grid, committed } = await mount();
    expect(grid.edit.start(0, AMOUNT)).toBe(true);
    grid.edit.updateValue("12");
    grid.edit.commit();

    expect(committed).toEqual([{ operation: "edit", changes: [change(1, "amount", "amount", 0, 12)], skipped: [] }]);
  });

  it("an editor commit the type refuses is one event with one skip and a rejection", async () => {
    const { grid, rows, committed, rejected } = await mount();
    expect(grid.edit.start(0, AMOUNT)).toBe(true);
    grid.edit.updateValue("x");
    grid.edit.commit();

    const skip = { row: 0, col: AMOUNT, field: "amount", reason: "type-mismatch", operation: "edit" };
    expect(committed).toEqual([{ operation: "edit", changes: [], skipped: [skip] }]);
    expect(rejected).toEqual([skip]);
    expect(rows[0]?.amount).toBe(0);
  });

  it("a fill is one event with every filled cell", async () => {
    const { grid, committed } = await mount();
    grid.fill.startFillDrag({ startRow: 0, startCol: AMOUNT, endRow: 0, endCol: AMOUNT });
    grid.fill.updateFillDrag(2, AMOUNT);
    grid.fill.commitFillDrag();

    expect(committed).toEqual([{
      operation: "fill",
      changes: [change(2, "amount", "amount", 10, 0), change(3, "amount", "amount", 20, 0)],
      skipped: [],
    }]);
  });

  it("cells.setValue runs as its own command and names the column by colId", async () => {
    const { grid, committed } = await mount();
    grid.cells.setValue(1, NOTE, "k");

    expect(committed).toEqual([{ operation: "setCellValue", changes: [change(2, "memo", "note", "", "k")], skipped: [] }]);
  });

  it("a command that wrote and skipped nothing fires nothing", async () => {
    const { grid, committed } = await mount();
    expect(grid.edit.paste("x")).toBe(false);
    grid.cells.setValue(0, 99, 1);

    expect(committed).toEqual([]);
  });

  it("a write made inside onCellValueChanged joins the command", async () => {
    let mirrored = false;
    const { grid, committed } = await mount({
      options: {
        onCellValueChanged: (event) => {
          if (mirrored || event.field !== "name") return;
          mirrored = true;
          grid.cells.setValue(0, NOTE, `was ${String(event.oldValue)}`);
        },
      },
    });
    expect(grid.edit.start(0, NAME)).toBe(true);
    grid.edit.updateValue("z");
    grid.edit.commit();

    expect(committed).toEqual([{
      operation: "edit",
      changes: [change(1, "memo", "note", "", "was n1"), change(1, "name", "name", "n1", "z")],
      skipped: [],
    }]);
  });

  it("a callback that throws stops the command; the event lists the cells recorded before it", async () => {
    const { grid, rows, committed } = await mount({
      options: {
        onCellValueChanged: (event) => {
          if (event.field === "amount") throw new Error("boom");
        },
      },
    });
    grid.selection.setActiveCell(0, NAME);

    expect(() => grid.edit.paste("a\t5\tz")).toThrow("boom");

    expect(rows[0]).toEqual({ id: 1, name: "a", amount: 5, note: "" });
    expect(committed).toEqual([{ operation: "paste", changes: [change(1, "name", "name", "n1", "a")], skipped: [] }]);
  });

  it("onWriteCommitted without getRowId throws at construction", () => {
    expect(() => new GridCore<Row>({
      columns,
      dataSource: createClientDataSource(rowsOf(1), { useWorker: false }),
      rowHeight: 30,
      onWriteCommitted: () => undefined,
    })).toThrow("getRowId is required when onWriteCommitted is provided");
  });
});

describe("write commands — paste skips (D2)", () => {
  it("a target in a non-editable column is skipped without a rejection", async () => {
    const { grid, rows, committed, rejected } = await mount();
    grid.selection.setActiveCell(0, ID);

    expect(grid.edit.paste("x\ty")).toBe(true);

    expect(rows[0]).toEqual({ id: 1, name: "y", amount: 0, note: "" });
    expect(committed).toEqual([{
      operation: "paste",
      changes: [change(1, "name", "name", "n1", "y")],
      skipped: [{ row: 0, col: ID, field: "id", reason: "not-editable", operation: "paste" }],
    }]);
    expect(rejected).toEqual([]);
  });

  it("a value the column type cannot hold is skipped and rejected", async () => {
    const { grid, rows, committed, rejected } = await mount();
    grid.selection.setActiveCell(0, AMOUNT);

    expect(grid.edit.paste("abc")).toBe(true);

    const skip = { row: 0, col: AMOUNT, field: "amount", reason: "type-mismatch", operation: "paste" };
    expect(rows[0]?.amount).toBe(0);
    expect(committed).toEqual([{ operation: "paste", changes: [], skipped: [skip] }]);
    expect(rejected).toEqual([skip]);
  });

  it("a read-only source's paste and fill are one skip each and no change", async () => {
    const { grid, committed, rejected } = await mount({ writable: false });
    grid.selection.setActiveCell(0, NAME);

    expect(grid.edit.paste("x")).toBe(false);
    grid.fill.startFillDrag({ startRow: 0, startCol: AMOUNT, endRow: 0, endCol: AMOUNT });

    expect(committed).toEqual([
      { operation: "paste", changes: [], skipped: [{ row: 0, col: NAME, field: "name", reason: "read-only-source", operation: "paste" }] },
      { operation: "fill", changes: [], skipped: [{ row: 0, col: AMOUNT, field: "amount", reason: "read-only-source", operation: "fill" }] },
    ]);
    expect(rejected).toHaveLength(2);
  });
});
