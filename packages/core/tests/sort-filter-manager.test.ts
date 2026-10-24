// packages/core/tests/sort-filter-manager.test.ts

import { describe, it, expect, vi, afterEach } from "vitest";
import { SortFilterManager } from "../src/managers/sort-filter-manager";
import type { SortFilterManagerOptions } from "../src/managers/sort-filter-manager";
import type {
  ColumnDefinition,
  ColumnFilterModel,
  GridInstruction,
  RowAccess,
} from "../src/types";

interface Row {
  id: number;
  color: string;
}

const columns = (): ColumnDefinition[] => [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "color", cellDataType: "text", width: 120 },
  { field: "locked", cellDataType: "text", width: 120, sortable: false, filterable: false },
];

const anchor = { top: 0, left: 0, width: 10, height: 10 };

const valuesFilter = (selected: Array<string | number>): ColumnFilterModel => ({
  groups: [{
    conditions: [{ type: "text", operator: "equals", selectedValues: new Set(selected) }],
    combination: "and",
  }],
  combination: "and",
});

const setup = (overrides: Partial<SortFilterManagerOptions<Row>> = {}) => {
  const onSortFilterChange = vi.fn(async () => {});
  const manager = new SortFilterManager<Row>({
    getColumns: columns,
    isSortingEnabled: () => true,
    getCachedRows: () => new Map(),
    onSortFilterChange,
    onDataRefreshed: () => {},
    ...overrides,
  });
  const instructions: GridInstruction[] = [];
  manager.onInstruction((instruction) => instructions.push(instruction));
  return { manager, onSortFilterChange, instructions };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SortFilterManager sorting", () => {
  it("ignores sort commands while sorting is disabled", async () => {
    const { manager, onSortFilterChange } = setup({ isSortingEnabled: () => false });

    await manager.setSort("color", "asc");

    expect(manager.getSortModel()).toEqual([]);
    expect(manager.isColumnSortable(1)).toBe(false);
    expect(onSortFilterChange).not.toHaveBeenCalled();
  });

  it("ignores a sort on a column that opted out", async () => {
    const { manager, onSortFilterChange } = setup();

    await manager.setSort("locked", "asc");

    expect(manager.getSortModel()).toEqual([]);
    expect(manager.isColumnSortable(2)).toBe(false);
    expect(onSortFilterChange).not.toHaveBeenCalled();
  });

  it("adds, updates and removes entries of a multi-column sort", async () => {
    const { manager } = setup();

    await manager.setSort("color", "asc");
    await manager.setSort("id", "desc", true);
    await manager.setSort("color", "desc", true);
    expect(manager.getSortModel()).toEqual([
      { colId: "color", direction: "desc" },
      { colId: "id", direction: "desc" },
    ]);

    await manager.setSort("color", null, true);
    expect(manager.getSortModel()).toEqual([{ colId: "id", direction: "desc" }]);

    await manager.setSort("id", null);
    expect(manager.getSortModel()).toEqual([]);
  });
});

describe("SortFilterManager filtering", () => {
  it("ignores a filter on a column that opted out", async () => {
    const { manager, onSortFilterChange } = setup();

    await manager.setFilter("locked", "x");

    expect(manager.getFilterModel()).toEqual({});
    expect(manager.isColumnFilterable(2)).toBe(false);
    expect(onSortFilterChange).not.toHaveBeenCalled();
  });

  it("removes a filter when the replacement has no conditions", async () => {
    const { manager } = setup();
    await manager.setFilter("color", "red");
    expect(manager.hasActiveFilter("color")).toBe(true);

    await manager.setFilter("color", { groups: [], combination: "and" });

    expect(manager.hasActiveFilter("color")).toBe(false);
    expect(manager.getFilterModel()).toEqual({});
  });

  it("warns once about a string-only selection on a non-string column", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manager } = setup();

    await manager.setFilter("id", valuesFilter(["1", "2"]));
    await manager.setFilter("id", valuesFilter(["3"]));

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn for raw-typed selections or string columns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manager } = setup();

    await manager.setFilter("id", valuesFilter([1, 2]));
    await manager.setFilter("color", valuesFilter(["red"]));

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("SortFilterManager distinct values", () => {
  it("scans a record-less source through its scalar access and warns once when large", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const access: RowAccess = {
      rowCount: 10_001,
      getValue: (row) => (row % 2 === 0 ? "even" : "odd"),
    };
    const { manager } = setup({ getRowAccess: () => access });

    expect(manager.getDistinctValuesForColumn("color")).toEqual(["even", "odd"]);
    manager.getDistinctValuesForColumn("color");

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back to the row cache when the source has no scalar access", () => {
    const cachedRows = new Map<number, Row>([
      [0, { id: 0, color: "red" }],
      [2, { id: 2, color: "blue" }],
    ]);
    const { manager } = setup({ getRowAccess: () => null, getCachedRows: () => cachedRows });

    // Index 1 is missing: the scan skips it and reads what the cache size covers.
    expect(manager.getDistinctValuesForColumn("color")).toEqual(["red"]);
  });

  it("warns once when a pre-supplied formatted domain exceeds the cap", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supplied: ColumnDefinition[] = [{
      field: "color",
      cellDataType: "text",
      width: 120,
      distinctValues: ["a", "b", "c"],
      valueFormatter: (value) => String(value).toUpperCase(),
    }];
    const { manager } = setup({ getColumns: () => supplied });

    expect(manager.getDistinctValuesForColumn("color", 2)).toEqual(["a", "b"]);
    manager.getDistinctValuesForColumn("color", 2);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns nothing for an unknown column", () => {
    const { manager } = setup();
    expect(manager.getDistinctValuesForColumn("missing")).toEqual([]);
  });
});

describe("SortFilterManager filter popup", () => {
  it("does not open for a missing or non-filterable column", () => {
    const { manager, instructions } = setup();

    manager.openFilterPopup(9, anchor);
    manager.openFilterPopup(2, anchor);

    expect(instructions).toEqual([]);
  });

  it("opens without a values list when the adapter does not need one, then toggles closed", () => {
    const { manager, instructions } = setup();

    manager.openFilterPopup(1, anchor, false);
    manager.openFilterPopup(1, anchor, false);

    expect(instructions.map((instruction) => instruction.type)).toEqual([
      "OPEN_FILTER_POPUP",
      "CLOSE_FILTER_POPUP",
    ]);
    expect(instructions[0]).toMatchObject({ colIndex: 1, distinctValues: [] });
  });
});

describe("SortFilterManager.reconcileColumns", () => {
  it("drops sort and filter entries of removed columns and asks for a re-query", async () => {
    const { manager } = setup();
    await manager.setSort("color", "asc");
    await manager.setFilter("color", "red");
    await manager.setFilter("id", valuesFilter([1]));

    expect(manager.reconcileColumns(new Set(["id"]))).toBe(true);

    expect(manager.getSortModel()).toEqual([]);
    expect(Object.keys(manager.getFilterModel())).toEqual(["id"]);
  });

  it("reports no change when every target survives", async () => {
    const { manager } = setup();
    await manager.setSort("color", "asc");

    expect(manager.reconcileColumns(new Set(["id", "color"]))).toBe(false);
  });

  it("closes the popup only when its column was removed", () => {
    const { manager, instructions } = setup();
    manager.openFilterPopup(1, anchor, false);

    manager.reconcileColumns(new Set(["id", "color"]));
    expect(instructions.map((instruction) => instruction.type)).toEqual(["OPEN_FILTER_POPUP"]);

    manager.reconcileColumns(new Set(["id"]));
    expect(instructions.map((instruction) => instruction.type)).toEqual([
      "OPEN_FILTER_POPUP",
      "CLOSE_FILTER_POPUP",
    ]);
  });
});

describe("SortFilterManager while loading", () => {
  const setupLoading = () => {
    let loading = true;
    const harness = setup({ isLoading: () => loading });
    return { ...harness, finishLoading: () => { loading = false; } };
  };

  it("ignores sort commands until the load finishes", async () => {
    const { manager, onSortFilterChange, finishLoading } = setupLoading();

    await manager.setSort("color", "asc");
    expect(manager.getSortModel()).toEqual([]);
    expect(onSortFilterChange).not.toHaveBeenCalled();

    finishLoading();
    await manager.setSort("color", "asc");
    expect(manager.getSortModel()).toEqual([{ colId: "color", direction: "asc" }]);
    expect(onSortFilterChange).toHaveBeenCalledTimes(1);
  });

  it("ignores filter commands until the load finishes", async () => {
    const { manager, onSortFilterChange, finishLoading } = setupLoading();

    await manager.setFilter("color", "red");
    expect(manager.hasActiveFilter("color")).toBe(false);
    expect(onSortFilterChange).not.toHaveBeenCalled();

    finishLoading();
    await manager.setFilter("color", "red");
    expect(manager.hasActiveFilter("color")).toBe(true);
    expect(onSortFilterChange).toHaveBeenCalledTimes(1);
  });

  it("does not open the filter popup until the load finishes", () => {
    const { manager, instructions, finishLoading } = setupLoading();

    manager.openFilterPopup(1, anchor, false);
    expect(instructions).toEqual([]);

    finishLoading();
    manager.openFilterPopup(1, anchor, false);
    expect(instructions.map((instruction) => instruction.type)).toContain("OPEN_FILTER_POPUP");
  });
});
