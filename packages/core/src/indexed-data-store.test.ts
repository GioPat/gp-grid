// packages/core/src/indexed-data-store.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { IndexedDataStore } from "./indexed-data-store";

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

  beforeEach(() => {
    // Deep clone to avoid mutation between tests
    store = new IndexedDataStore(createInitialData(), {
      getRowId: (row) => row.id,
    });
  });

  describe("initialization", () => {
    it("should initialize with data", () => {
      expect(store.getTotalRowCount()).toBe(3);
    });

    it("should allow lookup by ID", () => {
      const row = store.getRowById(2);
      expect(row?.name).toBe("Bob");
    });

    it("should allow lookup by index", () => {
      const row = store.getRowByIndex(0);
      expect(row?.name).toBe("Alice");
    });
  });

  describe("query", () => {
    it("should return paginated results", () => {
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 2 },
      });

      expect(result.rows.length).toBe(2);
      expect(result.totalRows).toBe(3);
    });

    it("should apply sorting", () => {
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });

      expect(result.rows[0]?.name).toBe("Bob"); // age 25
      expect(result.rows[1]?.name).toBe("Alice"); // age 30
      expect(result.rows[2]?.name).toBe("Charlie"); // age 35
    });

    it("should apply descending sort", () => {
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "desc" }],
      });

      expect(result.rows[0]?.name).toBe("Charlie"); // age 35
      expect(result.rows[2]?.name).toBe("Bob"); // age 25
    });

    it("should apply filtering", () => {
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: "ob" },
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.name).toBe("Bob");
      expect(result.totalRows).toBe(1);
    });
  });

  describe("addRows", () => {
    it("should add a row", () => {
      store.addRows([{ id: 4, name: "David", age: 40 }]);
      expect(store.getTotalRowCount()).toBe(4);
      expect(store.getRowById(4)?.name).toBe("David");
    });

    it("should add multiple rows", () => {
      store.addRows([
        { id: 4, name: "David", age: 40 },
        { id: 5, name: "Eve", age: 28 },
      ]);
      expect(store.getTotalRowCount()).toBe(5);
    });

    it("should maintain sort order when adding rows", () => {
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });

      // Add a row with age 27 (should go between Bob and Alice)
      store.addRows([{ id: 4, name: "David", age: 27 }]);

      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });

      expect(result.rows[0]?.name).toBe("Bob"); // age 25
      expect(result.rows[1]?.name).toBe("David"); // age 27
      expect(result.rows[2]?.name).toBe("Alice"); // age 30
    });

    it("should skip duplicate IDs", () => {
      store.addRows([{ id: 1, name: "Duplicate", age: 50 }]);
      expect(store.getTotalRowCount()).toBe(3);
      expect(store.getRowById(1)?.name).toBe("Alice"); // Original unchanged
    });

    it("should honor filter when adding rows", () => {
      // First apply a filter
      const result1 = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: "ob" },
      });
      expect(result1.totalRows).toBe(1); // Only Bob matches

      // Add a row that matches the filter
      store.addRows([{ id: 4, name: "Robert", age: 40 }]);

      // Query again - should have 2 matching rows
      const result2 = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: "ob" },
      });
      expect(result2.totalRows).toBe(2);
      expect(result2.rows.map((r) => r.name).sort()).toEqual(["Bob", "Robert"]);

      // Add a row that does NOT match the filter
      store.addRows([{ id: 5, name: "Eve", age: 28 }]);

      // Query again - should still have only 2 matching rows
      const result3 = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: "ob" },
      });
      expect(result3.totalRows).toBe(2);
      expect(result3.rows.map((r) => r.name).sort()).toEqual(["Bob", "Robert"]);
    });

    it("should maintain sort order when adding rows (numeric ID)", () => {
      // Sort by ID descending
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "id", direction: "desc" }],
      });

      // Add a new row with higher ID
      store.addRows([{ id: 10, name: "Zach", age: 22 }]);

      // Query - new row should be first (highest ID)
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "id", direction: "desc" }],
      });

      expect(result.rows[0]?.id).toBe(10); // New row should be first
      expect(result.rows[0]?.name).toBe("Zach");
      expect(result.rows.map((r) => r.id)).toEqual([10, 3, 2, 1]); // Descending order
    });

    it("should maintain sort order when adding rows (ascending ID)", () => {
      // Sort by ID ascending
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "id", direction: "asc" }],
      });

      // Add a new row with higher ID
      store.addRows([{ id: 10, name: "Zach", age: 22 }]);

      // Query - new row should be last (highest ID)
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "id", direction: "asc" }],
      });

      expect(result.rows[3]?.id).toBe(10); // New row should be last
      expect(result.rows.map((r) => r.id)).toEqual([1, 2, 3, 10]); // Ascending order
    });
  });

  describe("removeRows", () => {
    it("should remove a row by ID", () => {
      store.removeRows([2]);
      expect(store.getTotalRowCount()).toBe(2);
      expect(store.getRowById(2)).toBeUndefined();
    });

    it("should remove multiple rows", () => {
      store.removeRows([1, 3]);
      expect(store.getTotalRowCount()).toBe(1);
      expect(store.getRowById(2)?.name).toBe("Bob");
    });

    it("should update indices correctly after removal", () => {
      store.removeRows([1]);

      // Remaining rows should still be accessible
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
      });

      expect(result.rows.length).toBe(2);
      expect(result.rows.map((r) => r.name).sort()).toEqual(["Bob", "Charlie"]);
    });
  });

  describe("updateCell", () => {
    it("should update a cell value", () => {
      store.updateCell(2, "name", "Robert");
      expect(store.getRowById(2)?.name).toBe("Robert");
    });

    it("should maintain sort order when updating sorted column", () => {
      // Sort by age ascending
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });

      // Change Bob's age from 25 to 40 (should move to end)
      store.updateCell(2, "age", 40);

      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });

      expect(result.rows[0]?.name).toBe("Alice"); // age 30
      expect(result.rows[1]?.name).toBe("Charlie"); // age 35
      expect(result.rows[2]?.name).toBe("Bob"); // age 40 now
    });

    it("should update filter results when filtered column changes", () => {
      // Set up filter
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: "ali" },
      });

      // Change Alice's name so it no longer matches
      store.updateCell(1, "name", "Alicia");

      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: "ali" },
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.name).toBe("Alicia");
    });
  });

  describe("updateRow", () => {
    it("should update multiple fields", () => {
      store.updateRow(2, { name: "Robert", age: 26 });
      const row = store.getRowById(2);
      expect(row?.name).toBe("Robert");
      expect(row?.age).toBe(26);
    });
  });

  describe("getDistinctValues", () => {
    it("should return distinct values for a field", () => {
      const ages = store.getDistinctValues("age");
      expect(ages.sort()).toEqual([25, 30, 35]);
    });

    it("should include new values after add", () => {
      store.addRows([{ id: 4, name: "David", age: 40 }]);
      const ages = store.getDistinctValues("age");
      expect(ages).toContain(40);
    });
  });

  describe("getSortModel / setSortModel", () => {
    it("should track sort model", () => {
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "name", direction: "asc" }],
      });

      expect(store.getSortModel()).toEqual([{ colId: "name", direction: "asc" }]);
    });

    it("should rebuild indices when sort model changes", () => {
      // First sort by age
      const result1 = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });
      expect(result1.rows[0]?.name).toBe("Bob");

      // Then sort by name
      const result2 = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "name", direction: "asc" }],
      });
      expect(result2.rows[0]?.name).toBe("Alice");
    });
  });

  describe("getFilterModel / setFilterModel", () => {
    it("should track filter model", () => {
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: "bob" },
      });

      expect(store.getFilterModel()).toEqual({ name: "bob" });
    });
  });
});
