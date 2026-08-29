// packages/core/tests/indexed-data-store.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { IndexedDataStore } from "../src/indexed-data-store";

interface TestRow {
  id: number;
  name: string;
  age: number;
}

describe("IndexedDataStore", () => {
  let store: IndexedDataStore<TestRow>;

  const createInitialData = (): TestRow[] => [
    { id: 1, name: "Alice", age: 30 },
    { id: 2, name: "Bob", age: 25 },
    { id: 3, name: "Charlie", age: 35 },
  ];

  const names = () => store.getAllRows().map((r) => r.name);

  beforeEach(() => {
    // Fresh data per test so mutations don't leak between cases
    store = new IndexedDataStore({ getRowId: (row) => row.id }, createInitialData());
  });

  describe("initialization", () => {
    it("should initialize with data", () => {
      expect(store.getTotalRowCount()).toBe(3);
    });

    it("should allow lookup by ID", () => {
      expect(store.getRowById(2)?.name).toBe("Bob");
    });

    it("getAllRows returns storage order as a copy", () => {
      const rows = store.getAllRows();
      expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
      rows.pop();
      expect(store.getTotalRowCount()).toBe(3);
    });

    it("setData replaces everything and re-indexes", () => {
      store.setData([{ id: 9, name: "Zed", age: 1 }]);
      expect(store.getTotalRowCount()).toBe(1);
      expect(store.getRowById(1)).toBeUndefined();
      expect(store.getRowById(9)?.name).toBe("Zed");
      expect(store.getDistinctValues("age")).toEqual([1]);
    });

    it("clear empties rows, ids and distinct values", () => {
      store.clear();
      expect(store.getTotalRowCount()).toBe(0);
      expect(store.getRowById(1)).toBeUndefined();
      expect(store.getDistinctValues("age")).toEqual([]);
    });
  });

  describe("addRows", () => {
    it("should add a row", () => {
      store.addRows([{ id: 4, name: "David", age: 40 }]);
      expect(store.getTotalRowCount()).toBe(4);
      expect(store.getRowById(4)?.name).toBe("David");
    });

    it("should append multiple rows in order", () => {
      store.addRows([
        { id: 4, name: "David", age: 40 },
        { id: 5, name: "Eve", age: 28 },
      ]);
      expect(names()).toEqual(["Alice", "Bob", "Charlie", "David", "Eve"]);
    });

    it("should skip duplicate IDs", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      store.addRows([{ id: 1, name: "Duplicate", age: 50 }]);
      expect(store.getTotalRowCount()).toBe(3);
      expect(store.getRowById(1)?.name).toBe("Alice"); // Original unchanged
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe("removeRows", () => {
    it("should remove a row by ID", () => {
      expect(store.removeRows([2])).toBe(1);
      expect(store.getTotalRowCount()).toBe(2);
      expect(store.getRowById(2)).toBeUndefined();
    });

    it("should remove multiple rows in one batch", () => {
      expect(store.removeRows([1, 3])).toBe(2);
      expect(names()).toEqual(["Bob"]);
      expect(store.getRowById(2)?.name).toBe("Bob");
    });

    it("ignores unknown ids and duplicates in the batch", () => {
      expect(store.removeRows([42, 2, 2])).toBe(1);
      expect(names()).toEqual(["Alice", "Charlie"]);
    });

    it("keeps storage order and ID lookups valid after a batch removal", () => {
      store.addRows([
        { id: 4, name: "David", age: 40 },
        { id: 5, name: "Eve", age: 28 },
      ]);
      store.removeRows([1, 3, 5]);
      expect(names()).toEqual(["Bob", "David"]);
      expect(store.getRowById(2)?.name).toBe("Bob");
      expect(store.getRowById(4)?.name).toBe("David");
      expect(store.getRowById(1)).toBeUndefined();
      expect(store.getRowById(5)).toBeUndefined();
    });

    it("update-then-remove preserves ID integrity", () => {
      store.updateCell(2, "age", 99);
      store.removeRows([1]);
      expect(store.getRowById(2)?.age).toBe(99);
      expect(store.getTotalRowCount()).toBe(2);
    });

    it("remove-all leaves the store empty and re-addable", () => {
      store.removeRows([1, 2, 3]);
      expect(store.getTotalRowCount()).toBe(0);
      expect(store.getAllRows()).toEqual([]);
      store.addRows([{ id: 1, name: "Alice", age: 30 }]);
      expect(store.getRowById(1)?.name).toBe("Alice");
    });
  });

  describe("updateCell / updateRow", () => {
    it("should update a cell value", () => {
      store.updateCell(2, "name", "Robert");
      expect(store.getRowById(2)?.name).toBe("Robert");
    });

    it("warns and ignores updates for unknown ids", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      store.updateCell(42, "name", "Nobody");
      expect(warn).toHaveBeenCalledOnce();
      expect(store.getTotalRowCount()).toBe(3);
      warn.mockRestore();
    });

    it("should update multiple fields", () => {
      store.updateRow(2, { name: "Robert", age: 26 });
      const row = store.getRowById(2);
      expect(row?.name).toBe("Robert");
      expect(row?.age).toBe(26);
    });
  });

  describe("moveRow", () => {
    it("moves a row forward and re-indexes ids", () => {
      store.moveRow(0, 2);
      expect(names()).toEqual(["Bob", "Alice", "Charlie"]);
      expect(store.getRowById(1)?.name).toBe("Alice");
      expect(store.getRowById(2)?.name).toBe("Bob");
    });

    it("moves a row backward", () => {
      store.moveRow(2, 0);
      expect(names()).toEqual(["Charlie", "Alice", "Bob"]);
      expect(store.getRowById(3)?.name).toBe("Charlie");
    });

    it("ignores no-op and out-of-range moves", () => {
      store.moveRow(1, 1);
      store.moveRow(-1, 0);
      store.moveRow(0, 3);
      expect(names()).toEqual(["Alice", "Bob", "Charlie"]);
    });
  });

  describe("distinct values (refcounted)", () => {
    // distinctValues tracks a per-value refcount. A value disappears from
    // the filter popup when the last row holding it is removed or updated
    // away. These tests guard the increment/decrement paths in addRows,
    // removeRows, and updateCell.
    it("should return distinct values for a field", () => {
      expect(store.getDistinctValues("age").sort()).toEqual([25, 30, 35]);
    });

    it("adds new values when addRows introduces unseen fields", () => {
      expect(store.getDistinctValues("age")).not.toContain(99);
      store.addRows([{ id: 99, name: "Dave", age: 99 }]);
      expect(store.getDistinctValues("age")).toContain(99);
    });

    it("removes a value when the last row holding it is deleted", () => {
      expect(store.getDistinctValues("age")).toContain(35);
      store.removeRows([3]);
      expect(store.getDistinctValues("age")).not.toContain(35);
    });

    it("keeps a value when other rows still reference it", () => {
      store.addRows([{ id: 4, name: "Dave", age: 30 }]);
      store.removeRows([1]); // Alice (the original age-30)
      expect(store.getDistinctValues("age")).toContain(30); // Dave still has it
    });

    it("updateCell evicts the old value when no row references it", () => {
      store.updateCell(1, "age", 99);
      const ages = store.getDistinctValues("age");
      expect(ages).toContain(99);
      expect(ages).not.toContain(30);
    });

    it("updateCell keeps the old value when another row still holds it", () => {
      store.addRows([{ id: 4, name: "Dave", age: 30 }]);
      store.updateCell(1, "age", 99); // Alice leaves 30, Dave still has 30
      const ages = store.getDistinctValues("age");
      expect(ages).toContain(30);
      expect(ages).toContain(99);
    });
  });
});
