import { describe, expect, it, vi } from "vitest";
import { SortFilterManager } from "../src/managers/sort-filter-manager";
import type { CellDataType, ColumnDefinition } from "../src/types";

interface Row {
  value: unknown;
}

const anchorRect = { top: 10, left: 20, width: 100, height: 30 };

const buildManager = (
  cellDataType: CellDataType,
  getCachedRows: () => Map<number, Row>,
): SortFilterManager<Row> => {
  const columns: ColumnDefinition[] = [
    { field: "value", cellDataType, width: 100 },
  ];

  return new SortFilterManager<Row>({
    getColumns: () => columns,
    isSortingEnabled: () => true,
    getCachedRows,
    onSortFilterChange: async () => {},
    onDataRefreshed: () => {},
  });
};

describe("filter popup distinct values", () => {
  it.each([
    "number",
    "date",
    "dateString",
    "dateTime",
    "dateTimeString",
  ] as const)("opens %s filters without scanning rows", (cellDataType) => {
    const getCachedRows = vi.fn(() => new Map<number, Row>([
      [0, { value: new Date() }],
    ]));
    const manager = buildManager(cellDataType, getCachedRows);
    const listener = vi.fn();
    manager.onInstruction(listener);

    manager.openFilterPopup(0, anchorRect, false);

    expect(getCachedRows).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: "OPEN_FILTER_POPUP",
      distinctValues: [],
    }));
  });

  it("continues computing distinct values for text filters", () => {
    const getCachedRows = vi.fn(() => new Map<number, Row>([
      [0, { value: "beta" }],
      [1, { value: "alpha" }],
      [2, { value: "beta" }],
    ]));
    const manager = buildManager("text", getCachedRows);
    const listener = vi.fn();
    manager.onInstruction(listener);

    manager.openFilterPopup(0, anchorRect);

    expect(getCachedRows).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: "OPEN_FILTER_POPUP",
      distinctValues: ["alpha", "beta"],
    }));
  });
});
