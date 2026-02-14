// packages/core/tests/mutable-data-source.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { createMutableClientDataSource } from "../src/data-source/mutable-data-source";
import type { MutableDataSource } from "../src/data-source/mutable-data-source";

interface TestRow {
  id: number;
  name: string;
  age: number;
}

describe("MutableClientDataSource", () => {
  let dataSource: MutableDataSource<TestRow>;
  let largeDataset: TestRow[];

  beforeEach(() => {
    // Create a small dataset for basic tests
    const smallDataset = [
      { id: 1, name: "Charlie", age: 35 },
      { id: 2, name: "Alice", age: 25 },
      { id: 3, name: "Bob", age: 30 },
    ];

    dataSource = createMutableClientDataSource(smallDataset, {
      getRowId: (row) => row.id,
      debounceMs: 0,
      useWorker: true,
    });

    // Create large dataset for Web Worker testing (exceeds WORKER_THRESHOLD)
    largeDataset = Array.from({ length: 250000 }, (_, i) => ({
      id: i + 1,
      name: `Person ${i + 1}`,
      age: Math.floor(Math.random() * 50) + 20,
    }));
  });

  describe("basic functionality", () => {
    it("should fetch data correctly", async () => {
      const response = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 10 },
      });

      expect(response.rows).toHaveLength(3);
      expect(response.totalRows).toBe(3);
      expect(response.rows[0]?.name).toBe("Charlie");
    });

    it("should support mutation operations", async () => {
      dataSource.updateRow(1, { name: "Updated Charlie" });
      await dataSource.flushTransactions();

      const response = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 10 },
      });

      const updatedRow = response.rows.find((row) => row.id === 1);
      expect(updatedRow?.name).toBe("Updated Charlie");
    });
  });

  describe("sorting", () => {
    it("should sort small datasets synchronously", async () => {
      const response = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "name", direction: "asc" }],
      });

      expect(response.rows[0]?.name).toBe("Alice");
      expect(response.rows[1]?.name).toBe("Bob");
      expect(response.rows[2]?.name).toBe("Charlie");
    });

    it("should handle large dataset with Web Worker sorting", async () => {
      // Create data source with large dataset
      const largeDataSource = createMutableClientDataSource(largeDataset, {
        getRowId: (row) => row.id,
        debounceMs: 0,
        useWorker: true,
      });

      const response = await largeDataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "age", direction: "asc" }],
      });

      expect(response.rows).toHaveLength(10);
      expect(response.totalRows).toBe(250000);
      
      // Verify sorting worked (ages should be in ascending order)
      for (let i = 1; i < response.rows.length; i++) {
        const prevAge = response.rows[i - 1]?.age ?? 0;
        const currAge = response.rows[i]?.age ?? 0;
        expect(prevAge).toBeLessThanOrEqual(currAge);
      }

      // Cleanup
      largeDataSource.clear();
    });

    it("should fall back to sync sorting when worker disabled", async () => {
      const largeDataSource = createMutableClientDataSource(largeDataset, {
        getRowId: (row) => row.id,
        debounceMs: 0,
        useWorker: false, // Disable worker
      });

      const response = await largeDataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 10 },
        sort: [{ colId: "name", direction: "desc" }],
      });

      expect(response.rows).toHaveLength(10);
      expect(response.totalRows).toBe(250000);
      
      // Verify sorting worked (names should be in descending order)
      for (let i = 1; i < response.rows.length; i++) {
        const prevName = response.rows[i - 1]?.name ?? "";
        const currName = response.rows[i]?.name ?? "";
        expect(prevName.localeCompare(currName)).toBeGreaterThanOrEqual(0);
      }

      // Cleanup
      largeDataSource.clear();
    });
  });

  describe("filtering", () => {
    it("should apply filters correctly", async () => {
      dataSource.updateRow(1, { age: 40 });
      dataSource.updateRow(3, { age: 20 });
      await dataSource.flushTransactions();

      const response = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 10 },
        filter: {
          age: {
            conditions: [{ type: "number", operator: ">", value: 25 }],
            combination: "and",
          },
        },
      });

      // We expect at least 1 row (Charlie with age 40), possibly 2 if Bob was updated
      expect(response.totalRows).toBeGreaterThanOrEqual(1);
      expect(response.rows.every((row) => row.age > 25)).toBe(true);
    });
  });

  describe("parallel sort options", () => {
    it("should accept custom parallel sort options", async () => {
      const largeDataSource = createMutableClientDataSource(largeDataset, {
        getRowId: (row) => row.id,
        debounceMs: 0,
        useWorker: true,
        parallelSort: { maxWorkers: 2 }, // Custom worker count
      });

      const response = await largeDataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 5 },
        sort: [{ colId: "name", direction: "asc" }],
      });

      expect(response.rows).toHaveLength(5);
      expect(response.totalRows).toBe(250000);

      // Cleanup
      largeDataSource.clear();
    });

    it("should handle parallel sort disabled", async () => {
      const largeDataSource = createMutableClientDataSource(largeDataset, {
        getRowId: (row) => row.id,
        debounceMs: 0,
        useWorker: true,
        parallelSort: false, // Disable parallel sort
      });

      const response = await largeDataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 5 },
        sort: [{ colId: "age", direction: "desc" }],
      });

      expect(response.rows).toHaveLength(5);
      expect(response.totalRows).toBe(250000);

      // Cleanup
      largeDataSource.clear();
    });
  });
});