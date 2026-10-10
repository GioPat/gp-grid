// Edit commits coerce a text draft by the column's cellDataType, like paste.

import { describe, expect, it, vi } from "vitest";
import { EditManager } from "../src/edit-manager";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { createRowGrouping } from "../src/row-grouping";
import type { CellDataType, CellValue, ColumnDefinition } from "../src/types";

const commitDraft = (cellDataType: CellDataType, draft: CellValue, initial: CellValue = null) => {
  const column: ColumnDefinition = { field: "f", cellDataType, width: 100, editable: true };
  const setCellValue = vi.fn();
  const onWriteRejected = vi.fn();
  const manager = new EditManager({
    getColumn: () => column,
    getCellValue: () => initial,
    setCellValue,
    onWriteRejected,
  });
  manager.startEdit(0, 0);
  manager.updateValue(draft);
  manager.commit();
  return { setCellValue, onWriteRejected, manager };
};

const committed = (cellDataType: CellDataType, draft: CellValue) =>
  commitDraft(cellDataType, draft).setCellValue.mock.calls[0]?.[2];

describe("edit commit — coercion by cellDataType", () => {
  it("keeps text as typed and collapses a blank draft to the empty string, like paste", () => {
    expect(committed("text", " a b ")).toBe(" a b ");
    expect(committed("text", "")).toBe("");
    expect(committed("text", "   ")).toBe("");
  });

  it("parses numbers and stores a blank as null", () => {
    expect(committed("number", " 60000 ")).toBe(60000);
    expect(committed("number", "1.5")).toBe(1.5);
    expect(committed("number", "")).toBeNull();
  });

  it("parses true/false case-insensitively", () => {
    expect(committed("boolean", "TRUE")).toBe(true);
    expect(committed("boolean", "false")).toBe(false);
  });

  it("parses date and dateTime into a Date", () => {
    expect(committed("date", "2024-01-15")).toEqual(new Date("2024-01-15"));
    expect(committed("dateTime", "2024-01-15T10:30:00Z")).toEqual(new Date("2024-01-15T10:30:00Z"));
  });

  it("keeps a valid date string as written", () => {
    expect(committed("dateString", "2024-01-15")).toBe("2024-01-15");
  });

  it("parses JSON for an object column", () => {
    expect(committed("object", '{"a":1}')).toEqual({ a: 1 });
    expect(committed("object", "[1,2]")).toEqual([1, 2]);
  });

  it("passes a value a custom editor already typed through unchanged", () => {
    const date = new Date("2024-01-15");
    const list = ["x"];
    expect(committed("number", 42)).toBe(42);
    expect(committed("date", date)).toBe(date);
    expect(committed("object", list)).toBe(list);
    expect(committed("text", 7)).toBe(7);
  });

  it("drops an unconvertible value: nothing is written, the editor closes and the host hears why", () => {
    for (const [type, draft] of [
      ["number", "abc"],
      ["boolean", "yes"],
      ["date", "not a date"],
      ["dateString", "not a date"],
      ["object", "{bad"],
      ["number", Number.NaN],
      ["date", new Date("not a date")],
    ] as const) {
      const { setCellValue, onWriteRejected, manager } = commitDraft(type, draft, "old");
      expect(setCellValue).not.toHaveBeenCalled();
      expect(manager.isEditing()).toBe(false);
      expect(onWriteRejected).toHaveBeenCalledExactlyOnceWith({
        row: 0, col: 0, field: "f", reason: "type-mismatch", operation: "edit",
      });
    }
  });
});

describe("edit commit — row grouping", () => {
  it("a text draft on a number measure updates the group's sum", async () => {
    const sales = [
      { id: 1, country: "IT", amount: 10 },
      { id: 2, country: "IT", amount: 30 },
      { id: 3, country: "FR", amount: 5 },
    ];
    const grid = new GridCore({
      columns: [
        { field: "country", cellDataType: "text", width: 100 },
        { field: "amount", cellDataType: "number", width: 100, editable: true },
      ],
      dataSource: createClientDataSource(sales, { useWorker: false }),
      rowHeight: 30,
      headerHeight: 30,
      getRowId: (row) => row.id,
      rowGrouping: createRowGrouping({
        dimensions: [{ field: "country" }],
        measures: [{ field: "sum", source: "amount", aggregate: "sum" }],
        grandTotal: "top",
      }),
    });
    await grid.initialize();
    grid.setViewport(0, 0, 400, 600);
    grid.rowGroups.setExpanded(null, true);
    const rowOf = (id: number) =>
      Array.from({ length: grid.rows.getCount() }, (_, i) => grid.rows.getViewRow(i))
        .findIndex((row) => row?.kind === "record" && row.id === id);

    expect(grid.edit.start(rowOf(1), 1)).toBe(true);
    grid.edit.updateValue("60000");
    grid.edit.commit();

    expect(sales[0]!.amount).toBe(60000);
    expect(grid.cells.getFieldValue(0, "sum")).toBe(60035);
  });
});
