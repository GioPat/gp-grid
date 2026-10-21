// packages/core/tests/transaction-manager.test.ts

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { TransactionManager, type TransactionResult } from "../src/managers";
import { IndexedDataStore } from "../src/indexed-data-store";

interface TestRow {
  id: number;
  name: string;
  age: number;
}

describe("TransactionManager", () => {
  let store: IndexedDataStore<TestRow>;
  let manager: TransactionManager<TestRow>;
  let processedResults: TransactionResult[];

  const initialData: TestRow[] = [
    { id: 1, name: "Alice", age: 30 },
    { id: 2, name: "Bob", age: 25 },
  ];

  beforeEach(() => {
    processedResults = [];
    store = new IndexedDataStore({
      getRowId: (row) => row.id,
    }, [...initialData]);
    manager = new TransactionManager({
      debounceMs: 0, // Sync mode for tests
      store,
      onProcessed: (result) => processedResults.push(result),
    });
  });

  describe("sync mode (debounceMs = 0)", () => {
    it("should process add immediately", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      expect(store.getTotalRowCount()).toBe(3);
      expect(store.getRowById(3)?.name).toBe("Charlie");
    });

    it("should process remove immediately", () => {
      manager.remove([1]);

      expect(store.getTotalRowCount()).toBe(1);
      expect(store.getRowById(1)).toBeUndefined();
    });

    it("should process updateCell immediately", () => {
      manager.updateCell(1, "name", "Alicia");

      expect(store.getRowById(1)?.name).toBe("Alicia");
    });

    it("should process updateRow immediately", () => {
      manager.updateRow(1, { name: "Alicia", age: 31 });

      const row = store.getRowById(1);
      expect(row?.name).toBe("Alicia");
      expect(row?.age).toBe(31);
    });

    it("should call onProcessed callback", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      expect(processedResults.length).toBe(1);
      expect(processedResults[0]).toEqual({
        added: 1,
        removed: 0,
        updated: 0,
        changes: [{ kind: "add", rowId: 3 }],
      });
    });

    it("reports one change per row touched, an update with its fields", () => {
      manager.remove([2]);
      manager.updateCell(1, "name", "Alicia");
      manager.updateRow(1, { name: "Alice", age: 31 });

      expect(processedResults.map((result) => result.changes)).toEqual([
        [{ kind: "remove", rowId: 2 }],
        [{ kind: "update", rowId: 1, fields: ["name"] }],
        [{ kind: "update", rowId: 1, fields: ["name", "age"] }],
      ]);
    });
  });

  describe("debounced mode", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager = new TransactionManager({
        debounceMs: 50,
        store,
        onProcessed: (result) => processedResults.push(result),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should not process immediately", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      expect(store.getTotalRowCount()).toBe(2); // Not processed yet
    });

    it("should process after debounce time", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      vi.advanceTimersByTime(50);

      expect(store.getTotalRowCount()).toBe(3);
    });

    it("should batch multiple operations", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);
      manager.add([{ id: 4, name: "David", age: 40 }]);
      manager.updateCell(1, "name", "Alicia");

      vi.advanceTimersByTime(50);

      expect(store.getTotalRowCount()).toBe(4);
      expect(store.getRowById(1)?.name).toBe("Alicia");
      expect(processedResults.length).toBe(1);
      expect(processedResults[0]).toEqual({
        added: 2,
        removed: 0,
        updated: 1,
        changes: [
          { kind: "add", rowId: 3 },
          { kind: "add", rowId: 4 },
          { kind: "update", rowId: 1, fields: ["name"] },
        ],
      });
    });

    it("lists a row updated twice in one batch twice, in order", () => {
      manager.updateCell(1, "name", "A");
      manager.updateCell(2, "age", 26);
      manager.updateCell(1, "age", 31);

      vi.advanceTimersByTime(50);

      expect(processedResults[0]?.changes).toEqual([
        { kind: "update", rowId: 1, fields: ["name"] },
        { kind: "update", rowId: 2, fields: ["age"] },
        { kind: "update", rowId: 1, fields: ["age"] },
      ]);
    });

    it("should NOT reset timer on new operation (throttle, not debounce)", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      vi.advanceTimersByTime(30); // Not yet processed (timer fires at 50ms)

      manager.add([{ id: 4, name: "David", age: 40 }]);

      // Timer is NOT reset - still fires at 50ms from first operation
      vi.advanceTimersByTime(20); // At 50ms now, should be processed

      expect(store.getTotalRowCount()).toBe(4); // Both operations batched
    });
  });

  describe("flush", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager = new TransactionManager({
        debounceMs: 50,
        store,
        onProcessed: (result) => processedResults.push(result),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should process immediately when flushed", async () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      const flushPromise = manager.flush();

      // Process microtasks
      await vi.runAllTimersAsync();
      await flushPromise;

      expect(store.getTotalRowCount()).toBe(3);
    });

    it("should resolve when no pending transactions", async () => {
      await expect(manager.flush()).resolves.toBeUndefined();
    });
  });

  describe("hasPending / getPendingCount", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager = new TransactionManager({
        debounceMs: 50,
        store,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should report pending transactions", () => {
      expect(manager.hasPending()).toBe(false);
      expect(manager.getPendingCount()).toBe(0);

      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      expect(manager.hasPending()).toBe(true);
      expect(manager.getPendingCount()).toBe(1);
    });

    it("should report no pending after processing", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);

      vi.advanceTimersByTime(50);

      expect(manager.hasPending()).toBe(false);
      expect(manager.getPendingCount()).toBe(0);
    });
  });

  describe("clear", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager = new TransactionManager({
        debounceMs: 50,
        store,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should clear pending transactions", () => {
      manager.add([{ id: 3, name: "Charlie", age: 35 }]);
      manager.clear();

      vi.advanceTimersByTime(50);

      expect(store.getTotalRowCount()).toBe(2); // No new row added
    });
  });
});
