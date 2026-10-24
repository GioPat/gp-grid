import { describe, expect, it, vi } from "vitest";
import { RowStore, type RowStoreOptions } from "../src/managers/row-store";
import type {
  CellValue,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  RowAccess,
} from "../src/types";

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "text", width: 80 },
  { field: "name", cellDataType: "text", width: 120 },
];

const rows: Row[] = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
];

const dataSource: DataSource<Row> = {
  query: async () => ({ rows, totalRows: rows.length }),
};

const createOptions = (
  overrides: Partial<RowStoreOptions<Row>> = {},
): RowStoreOptions<Row> => ({
  getColumns: () => columns,
  getDataSource: () => dataSource,
  isWritable: () => true,
  getRowId: (row) => row.id,
  ...overrides,
});

const loadRows = (store: RowStore<Row>): void => {
  const cached = store.getCachedRows();
  rows.forEach((row, index) => cached.set(index, { ...row }));
  store.setTotalRows(rows.length);
};

const columnarAccess = (release = vi.fn()): RowAccess => ({
  rowCount: 2,
  getValue: (viewRow, field): CellValue => `${field}-${viewRow}`,
  getRowId: (viewRow) => `r${viewRow}`,
  release,
});

describe("RowStore over flat rows", () => {
  it("reads records, cells and identities by flat position", () => {
    const store = new RowStore<Row>(createOptions());
    loadRows(store);
    store.bumpRevision();

    expect(store.getRevision()).toBe(1);
    expect(store.getTotalRows()).toBe(3);
    expect(store.getRowData(1)?.name).toBe("Bo");
    expect(store.hasRow(2)).toBe(true);
    expect(store.hasRow(3)).toBe(false);
    expect(store.getCellValue(2, 1)).toBe("Cy");
    expect(store.getFieldValue(0, "name")).toBe("Ada");
    expect(store.getFieldValue(9, "name")).toBeNull();
    expect(store.getRowId(1)).toBe("b");
    expect(store.findViewIndexById("c")).toBe(2);
    expect(store.findViewIndexById("z")).toBe(-1);
    expect(store.getRecordById("a")?.name).toBe("Ada");
    expect(store.hasStableIdentity()).toBe(true);
    expect(store.getRowAccess()).toBeNull();
    expect(store.getHierarchy()).toBeNull();
    expect(store.getHierarchyRow(0)).toBeUndefined();
  });

  it("locates identities within a range and stops once all are found", () => {
    const store = new RowStore<Row>(createOptions());
    loadRows(store);

    const ids = new Set(["a", "c"]);
    expect([...store.locateIds(ids)]).toEqual([["a", 0], ["c", 2]]);
    expect([...store.locateIds(ids, { start: 1, end: 3 })]).toEqual([["c", 2]]);
  });

  it("reads scalar access instead of the cache and releases it on rebind", () => {
    const release = vi.fn();
    const store = new RowStore<Row>(createOptions());
    store.setRowAccess(columnarAccess(release));

    expect(store.getCellValue(1, 1)).toBe("name-1");
    expect(store.getCellValue(2, 1)).toBeNull();
    expect(store.getCellValue(0, 9)).toBeNull();
    expect(store.getFieldValue(0, "id")).toBe("id-0");
    expect(store.getRowId(1)).toBe("r1");
    expect(store.getRowId(5)).toBeUndefined();
    expect(store.hasRow(1)).toBe(true);
    expect(store.hasStableIdentity()).toBe(true);
    expect([...store.locateIds(new Set(["r1"]))]).toEqual([["r1", 1]]);

    store.setRowAccess(null);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("writes in place and reports a write to a read-only source", () => {
    const onCellValueChanged = vi.fn();
    const rejected: CellWriteRejectedEvent[] = [];
    let writable = true;
    const store = new RowStore<Row>(
      createOptions({
        isWritable: () => writable,
        onCellValueChanged,
        onWriteRejected: (event) => rejected.push(event),
      }),
    );
    loadRows(store);

    store.setCellValue(0, 1, "Ann");
    expect(store.getCellValue(0, 1)).toBe("Ann");
    expect(onCellValueChanged).toHaveBeenCalledTimes(1);

    writable = false;
    store.setCellValue(1, 1, "Bob");
    expect(store.getCellValue(1, 1)).toBe("Bo");
    expect(rejected).toEqual([
      { row: 1, col: 1, field: "name", reason: "read-only-source", operation: "setCellValue" },
    ]);
  });

  it("clears the cache and the count", () => {
    const store = new RowStore<Row>(createOptions());
    loadRows(store);
    store.clear();
    expect(store.getTotalRows()).toBe(0);
    expect(store.getRowData(0)).toBeUndefined();
  });
});
