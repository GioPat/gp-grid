// packages/core/tests/indexed-data-store.test.ts

import { describe, it, expect, beforeEach } from "vitest";
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

  beforeEach(() => {
    // Deep clone to avoid mutation between tests
    store = new IndexedDataStore({
      getRowId: (row) => row.id,
    }, createInitialData());
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
        filter: {
          name: {
            conditions: [{
              type: "text",
              operator: "contains",
              value: "ob",
            }], combination: "or"
          }
        },
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
        filter: {
          name: {
            conditions: [{
              type: "text",
              operator: "contains",
              value: "ob",
            }], combination: "or"
          }
        },

      });
      expect(result1.totalRows).toBe(1); // Only Bob matches

      // Add a row that matches the filter
      store.addRows([{ id: 4, name: "Robert", age: 40 }]);

      // Query again - should have 2 matching rows
      const result2 = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: {
          name: {
            conditions: [{
              type: "text",
              operator: "contains",
              value: "ob",
            }], combination: "or"
          }
        },

      });
      expect(result2.totalRows).toBe(2);
      expect(result2.rows.map((r) => r.name).sort()).toEqual(["Bob", "Robert"]);

      // Add a row that does NOT match the filter
      store.addRows([{ id: 5, name: "Eve", age: 28 }]);

      // Query again - should still have only 2 matching rows
      const result3 = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: {
          name: {
            conditions: [{
              type: "text",
              operator: "contains",
              value: "ob",
            }], combination: "or"
          }
        },
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
        filter: {
          name: {
            conditions: [{
              type: "text",
              operator: "contains",
              value: "ali",
            }], combination: "or"
          }
        },
      });

      // Change Alice's name so it no longer matches
      store.updateCell(1, "name", "Alicia");

      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: {
          name: {
            conditions: [{
              type: "text",
              operator: "contains",
              value: "ali",
            }], combination: "or"
          }
        },
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
        filter: {
          name: {
            conditions: [{
              type: "text",
              operator: "contains",
              value: "ali",
            }], combination: "or"
          }
        }
      });

      expect(store.getFilterModel()).toEqual({
        name: {
          conditions: [{
            type: "text",
            operator: "contains",
            value: "ali",
          }], combination: "or"
        }
      });
    });
  });

  // ==========================================================================
  // Reindex stress tests — these target the silent-corruption risk in
  // reindexAfterRemoval, updateCell, and the distinct-values cache.
  // The existing "should update indices correctly after removal" only
  // queries the remaining rows; these tests assert on ID lookups, sort
  // order, filter membership, and distinct-value contents after each
  // mutation so reindex bugs can't hide behind an aggregate query.
  // ==========================================================================

  describe("reindex under active sort", () => {
    it("keeps sorted order after removing a row", () => {
      // Sort by age asc, then remove Bob (youngest). Remaining order: Alice, Charlie.
      store.query({ pagination: { pageIndex: 0, pageSize: 10 }, sort: [{ colId: "age", direction: "asc" }] });
      store.removeRows([2]);
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });
      expect(result.rows.map((r) => r.name)).toEqual(["Alice", "Charlie"]);
    });

    it("updateCell on a NON-sort-affecting field does not change order", () => {
      // Invariant: if the updated field isn't in sortModel, sortedIndices must stay put.
      store.query({ pagination: { pageIndex: 0, pageSize: 10 }, sort: [{ colId: "age", direction: "asc" }] });
      const orderBefore = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      }).rows.map((r) => r.id);

      store.updateCell(2, "name", "Bobby"); // 'name' not in sortModel

      const orderAfter = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      }).rows.map((r) => r.id);
      expect(orderAfter).toEqual(orderBefore);
    });

    it("keeps correct sorted order after removing row while sort is active", () => {
      // Sort desc by age, then remove the middle row. Remaining order should
      // still descend cleanly: Charlie (35) → Bob (25).
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "desc" }],
      });
      store.removeRows([1]); // Alice
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "desc" }],
      });
      expect(result.rows.map((r) => r.name)).toEqual(["Charlie", "Bob"]);
    });
  });

  describe("reindex under active filter", () => {
    it("removed row exits filteredIndices cleanly", () => {
      // Filter to just Alice, then remove her; filtered count should be 0.
      store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: { conditions: [{ type: "text", operator: "equals", value: "Alice" }], combination: "or" } },
      });
      store.removeRows([1]);
      const result = store.query({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: { name: { conditions: [{ type: "text", operator: "equals", value: "Alice" }], combination: "or" } },
      });
      expect(result.rows.length).toBe(0);
      expect(store.getTotalRowCount()).toBe(2);
    });

    it("removing a filtered-OUT row doesn't break the filter set", () => {
      // Filter to only Alice. Remove Bob (who was filtered out). Alice stays visible.
      const filter = {
        name: { conditions: [{ type: "text" as const, operator: "equals" as const, value: "Alice" }], combination: "or" as const },
      };
      store.query({ pagination: { pageIndex: 0, pageSize: 10 }, filter });
      store.removeRows([2]); // Bob was filtered out
      const result = store.query({ pagination: { pageIndex: 0, pageSize: 10 }, filter });
      expect(result.rows.map((r) => r.name)).toEqual(["Alice"]);
      expect(store.getTotalRowCount()).toBe(2);
    });

    it("updateCell that makes a filtered-out row pass the filter makes it visible", () => {
      // Filter on name contains "ali" → only Alice visible. Rename Bob to "Bali"
      // (also contains "ali" — filter is case-insensitive). Both now visible.
      const filter = {
        name: { conditions: [{ type: "text" as const, operator: "contains" as const, value: "ali" }], combination: "or" as const },
      };
      store.query({ pagination: { pageIndex: 0, pageSize: 10 }, filter });
      store.updateCell(2, "name", "Bali");
      const result = store.query({ pagination: { pageIndex: 0, pageSize: 10 }, filter });
      expect(result.rows.map((r) => r.name).sort()).toEqual(["Alice", "Bali"]);
    });
  });

  describe("reindex — ID lookup stays valid after removal", () => {
    it("rows previously at higher indices are still reachable by ID", () => {
      // Before: Alice(idx 0), Bob(idx 1), Charlie(idx 2). Remove Alice → Bob shifts to 0, Charlie to 1.
      // But rowById must still return the right objects.
      store.removeRows([1]);
      expect(store.getRowById(2)?.name).toBe("Bob");
      expect(store.getRowById(3)?.name).toBe("Charlie");
    });

    it("update-then-remove preserves ID integrity", () => {
      // Update Bob's age, remove Alice (which shifts Bob's internal index).
      // Bob's updated field must still be reachable by his original ID.
      store.updateCell(2, "age", 99);
      store.removeRows([1]);
      expect(store.getRowById(2)?.age).toBe(99);
      expect(store.getTotalRowCount()).toBe(2);
    });
  });

  describe("distinct values cache (refcounted)", () => {
    // distinctValues tracks a per-value refcount. A value disappears from
    // the filter popup when the last row holding it is removed or updated
    // away. These tests guard the refcount increment/decrement paths in
    // addRow, removeRowByIndex, and updateCell.
    it("removes a value when the last row holding it is deleted", () => {
      // age 35 is only on Charlie. Remove Charlie → 35 should disappear.
      expect(store.getDistinctValues("age")).toContain(35);
      store.removeRows([3]);
      expect(store.getDistinctValues("age")).not.toContain(35);
    });

    it("keeps a value when other rows still reference it", () => {
      // Two rows have age 30; remove one, value should stay.
      store.addRows([{ id: 4, name: "Dave", age: 30 }]); // another age-30 row
      expect(store.getDistinctValues("age")).toContain(30);
      store.removeRows([1]); // Alice (the original age-30)
      expect(store.getDistinctValues("age")).toContain(30); // Dave still has it
    });

    it("adds new values when addRows introduces unseen fields", () => {
      expect(store.getDistinctValues("age")).not.toContain(99);
      store.addRows([{ id: 99, name: "Dave", age: 99 }]);
      expect(store.getDistinctValues("age")).toContain(99);
    });

    it("updateCell evicts the old value when no row references it", () => {
      // Alice is the only age-30 row; update her to 99. Expect 30 gone, 99 present.
      store.updateCell(1, "age", 99);
      const ages = store.getDistinctValues("age");
      expect(ages).toContain(99);
      expect(ages).not.toContain(30);
    });

    it("updateCell keeps the old value when another row still holds it", () => {
      // Give two rows age=30, then move only one; 30 should still be tracked.
      store.addRows([{ id: 4, name: "Dave", age: 30 }]);
      store.updateCell(1, "age", 99); // Alice leaves 30, Dave still has 30
      const ages = store.getDistinctValues("age");
      expect(ages).toContain(30);
      expect(ages).toContain(99);
    });
  });

  describe("combined sort + filter reindex", () => {
    it("remove under active sort AND filter keeps both consistent", () => {
      // Apply both: sort desc by age + filter names containing "e".
      // Matches: Alice (30) and Charlie (35). Sorted desc → [Charlie, Alice].
      // Remove Alice. Remaining should be just [Charlie].
      const params = {
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "desc" as const }],
        filter: {
          name: { conditions: [{ type: "text" as const, operator: "contains" as const, value: "e" }], combination: "or" as const },
        },
      };
      const before = store.query(params);
      expect(before.rows.map((r) => r.name)).toEqual(["Charlie", "Alice"]);

      store.removeRows([1]);

      const after = store.query(params);
      expect(after.rows.map((r) => r.name)).toEqual(["Charlie"]);
    });
  });

  describe("edge cases", () => {
    it("remove-all leaves the store empty but queryable", () => {
      store.removeRows([1, 2, 3]);
      expect(store.getTotalRowCount()).toBe(0);
      const result = store.query({ pagination: { pageIndex: 0, pageSize: 10 } });
      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
    });

    it("add a row that fails the active filter: totalRowCount up, visible unchanged", () => {
      const filter = {
        name: { conditions: [{ type: "text" as const, operator: "equals" as const, value: "Alice" }], combination: "or" as const },
      };
      store.query({ pagination: { pageIndex: 0, pageSize: 10 }, filter });
      store.addRows([{ id: 4, name: "Dave", age: 40 }]);

      // Storage grew by one row
      expect(store.getTotalRowCount()).toBe(4);

      // But the filter excludes Dave — visible set is still just Alice
      const result = store.query({ pagination: { pageIndex: 0, pageSize: 10 }, filter });
      expect(result.rows.map((r) => r.name)).toEqual(["Alice"]);
    });
  });
});
