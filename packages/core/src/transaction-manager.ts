// gp-grid-core/src/transaction-manager.ts

import type { CellValue, Row, RowId } from "./types";
import type { IndexedDataStore } from "./indexed-data-store";

// =============================================================================
// Types
// =============================================================================

export interface AddTransaction<TData> {
  type: "ADD";
  rows: TData[];
}

export interface RemoveTransaction {
  type: "REMOVE";
  rowIds: RowId[];
}

export interface UpdateCellTransaction {
  type: "UPDATE_CELL";
  rowId: RowId;
  field: string;
  value: CellValue;
}

export interface UpdateRowTransaction<TData> {
  type: "UPDATE_ROW";
  rowId: RowId;
  data: Partial<TData>;
}

export type Transaction<TData> =
  | AddTransaction<TData>
  | RemoveTransaction
  | UpdateCellTransaction
  | UpdateRowTransaction<TData>;

export interface TransactionResult {
  added: number;
  removed: number;
  updated: number;
}

export interface TransactionManagerOptions<TData extends Row> {
  /** Debounce time in milliseconds. Default 50. Set to 0 for sync. */
  debounceMs: number;
  /** The indexed data store to apply transactions to */
  store: IndexedDataStore<TData>;
  /** Callback when transactions are processed */
  onProcessed?: (result: TransactionResult) => void;
}

// =============================================================================
// TransactionManager
// =============================================================================

/**
 * Manages a queue of data mutations with debounced batch processing.
 * Supports ADD, REMOVE, UPDATE_CELL, and UPDATE_ROW operations.
 */
export class TransactionManager<TData extends Row = Row> {
  private queue: Transaction<TData>[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPromise: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;

  private options: TransactionManagerOptions<TData>;

  constructor(options: TransactionManagerOptions<TData>) {
    this.options = options;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Queue rows to be added.
   */
  add(rows: TData[]): void {
    if (rows.length === 0) return;

    this.queue.push({ type: "ADD", rows });
    this.scheduleProcessing();
  }

  /**
   * Queue rows to be removed by ID.
   */
  remove(rowIds: RowId[]): void {
    if (rowIds.length === 0) return;

    this.queue.push({ type: "REMOVE", rowIds });
    this.scheduleProcessing();
  }

  /**
   * Queue a cell update.
   */
  updateCell(rowId: RowId, field: string, value: CellValue): void {
    this.queue.push({ type: "UPDATE_CELL", rowId, field, value });
    this.scheduleProcessing();
  }

  /**
   * Queue a row update (multiple fields).
   */
  updateRow(rowId: RowId, data: Partial<TData>): void {
    if (Object.keys(data).length === 0) return;

    this.queue.push({ type: "UPDATE_ROW", rowId, data });
    this.scheduleProcessing();
  }

  /**
   * Force immediate processing of queued transactions.
   * Returns a promise that resolves when processing is complete.
   */
  flush(): Promise<void> {
    if (this.queue.length === 0) {
      return Promise.resolve();
    }

    // Cancel any pending debounce
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // If already have a pending promise, return it
    if (this.pendingPromise) {
      return new Promise((resolve, reject) => {
        const existing = this.pendingPromise!;
        const originalResolve = existing.resolve;
        const originalReject = existing.reject;

        existing.resolve = () => {
          originalResolve();
          resolve();
        };
        existing.reject = (error: Error) => {
          originalReject(error);
          reject(error);
        };
      });
    }

    // Create new promise and process
    return new Promise((resolve, reject) => {
      this.pendingPromise = { resolve, reject };
      this.processQueue();
    });
  }

  /**
   * Check if there are pending transactions.
   */
  hasPending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Get count of pending transactions.
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Clear all pending transactions without processing.
   */
  clear(): void {
    this.queue = [];

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pendingPromise) {
      this.pendingPromise.resolve();
      this.pendingPromise = null;
    }
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  /**
   * Schedule processing after throttle delay.
   * Uses throttle pattern: if a timer is already pending, new transactions
   * are added to the queue but don't reset the timer. This ensures updates
   * are processed even when they arrive faster than the throttle interval.
   */
  private scheduleProcessing(): void {
    // If sync mode (debounceMs = 0), process immediately
    if (this.options.debounceMs === 0) {
      this.processQueue();
      return;
    }

    // If timer already pending, new transactions will be processed when it fires
    if (this.debounceTimer !== null) {
      return;
    }

    // Schedule new timer
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.processQueue();
    }, this.options.debounceMs);
  }

  /**
   * Process all queued transactions.
   */
  private processQueue(): void {
    if (this.queue.length === 0) {
      if (this.pendingPromise) {
        this.pendingPromise.resolve();
        this.pendingPromise = null;
      }
      return;
    }

    // Take snapshot of current queue
    const transactions = this.queue;
    this.queue = [];

    // Process transactions
    const result: TransactionResult = {
      added: 0,
      removed: 0,
      updated: 0,
    };

    try {
      for (const tx of transactions) {
        switch (tx.type) {
          case "ADD":
            this.options.store.addRows(tx.rows);
            result.added += tx.rows.length;
            break;

          case "REMOVE":
            this.options.store.removeRows(tx.rowIds);
            result.removed += tx.rowIds.length;
            break;

          case "UPDATE_CELL":
            this.options.store.updateCell(tx.rowId, tx.field, tx.value);
            result.updated++;
            break;

          case "UPDATE_ROW":
            this.options.store.updateRow(tx.rowId, tx.data);
            result.updated++;
            break;
        }
      }

      // Notify callback
      if (this.options.onProcessed) {
        this.options.onProcessed(result);
      }

      // Resolve pending promise
      if (this.pendingPromise) {
        this.pendingPromise.resolve();
        this.pendingPromise = null;
      }
    } catch (error) {
      // Reject pending promise
      if (this.pendingPromise) {
        this.pendingPromise.reject(
          error instanceof Error ? error : new Error(String(error))
        );
        this.pendingPromise = null;
      }
    }
  }
}
