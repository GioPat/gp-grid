// packages/core/src/data-source/mutable-data-source.ts

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  Row,
  RowId,
  CellValue,
} from "../types";
import { IndexedDataStore } from "../indexed-data-store";
import {
  TransactionManager,
  type TransactionResult,
} from "../transaction-manager";

// =============================================================================
// Types
// =============================================================================

/** Callback for data change notifications */
export type DataChangeListener = (result: TransactionResult) => void;

/**
 * Data source with mutation capabilities.
 * Extends DataSource with add, remove, and update operations.
 */
export interface MutableDataSource<TData = Row> extends DataSource<TData> {
  /** Add rows to the data source. Queued and processed after debounce. */
  addRows(rows: TData[]): void;
  /** Remove rows by ID. Queued and processed after debounce. */
  removeRows(ids: RowId[]): void;
  /** Update a cell value. Queued and processed after debounce. */
  updateCell(id: RowId, field: string, value: CellValue): void;
  /** Update multiple fields on a row. Queued and processed after debounce. */
  updateRow(id: RowId, data: Partial<TData>): void;
  /** Force immediate processing of queued transactions. */
  flushTransactions(): Promise<void>;
  /** Check if there are pending transactions. */
  hasPendingTransactions(): boolean;
  /** Get distinct values for a field (for filter UI). */
  getDistinctValues(field: string): CellValue[];
  /** Get a row by ID. */
  getRowById(id: RowId): TData | undefined;
  /** Get total row count. */
  getTotalRowCount(): number;
  /** Subscribe to data change notifications. Returns unsubscribe function. */
  subscribe(listener: DataChangeListener): () => void;
}

export interface MutableClientDataSourceOptions<TData> {
  /** Function to extract unique ID from row. Required. */
  getRowId: (row: TData) => RowId;
  /** Custom field accessor for nested properties. */
  getFieldValue?: (row: TData, field: string) => CellValue;
  /** Debounce time for transactions in ms. Default 50. Set to 0 for sync. */
  debounceMs?: number;
  /** Callback when transactions are processed. */
  onTransactionProcessed?: (result: TransactionResult) => void;
}

// =============================================================================
// Mutable Client Data Source
// =============================================================================

/**
 * Creates a mutable client-side data source with transaction support.
 * Uses IndexedDataStore for efficient incremental operations.
 */
export function createMutableClientDataSource<TData extends Row = Row>(
  data: TData[],
  options: MutableClientDataSourceOptions<TData>,
): MutableDataSource<TData> {
  const {
    getRowId,
    getFieldValue,
    debounceMs = 50,
    onTransactionProcessed,
  } = options;

  // Create the indexed data store
  const store = new IndexedDataStore(data, {
    getRowId,
    getFieldValue,
  });

  // Subscribers for data change notifications
  const subscribers = new Set<DataChangeListener>();

  // Create the transaction manager
  const transactionManager = new TransactionManager<TData>({
    debounceMs,
    store,
    onProcessed: (result) => {
      // Notify external callback
      onTransactionProcessed?.(result);
      // Notify all subscribers
      for (const listener of subscribers) {
        listener(result);
      }
    },
  });

  return {
    async fetch(
      request: DataSourceRequest,
    ): Promise<DataSourceResponse<TData>> {
      // Flush any pending transactions before fetching
      if (transactionManager.hasPending()) {
        await transactionManager.flush();
      }

      return store.query(request);
    },

    addRows(rows: TData[]): void {
      transactionManager.add(rows);
    },

    removeRows(ids: RowId[]): void {
      transactionManager.remove(ids);
    },

    updateCell(id: RowId, field: string, value: CellValue): void {
      transactionManager.updateCell(id, field, value);
    },

    updateRow(id: RowId, data: Partial<TData>): void {
      transactionManager.updateRow(id, data);
    },

    async flushTransactions(): Promise<void> {
      await transactionManager.flush();
    },

    hasPendingTransactions(): boolean {
      return transactionManager.hasPending();
    },

    getDistinctValues(field: string): CellValue[] {
      return store.getDistinctValues(field);
    },

    getRowById(id: RowId): TData | undefined {
      return store.getRowById(id);
    },

    getTotalRowCount(): number {
      return store.getTotalRowCount();
    },

    subscribe(listener: DataChangeListener): () => void {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
  };
}
