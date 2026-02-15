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
} from "../managers";
import { ParallelSortManager, type ParallelSortOptions } from "../sorting";
import {
  toSortableNumber,
  stringToSortableHashes,
  applySort,
  HASH_CHUNK_COUNT,
} from "./sorting";
import { applyFilters } from "./filtering";
import { createInstructionEmitter } from "../utils";

// =============================================================================
// Configuration
// =============================================================================

/** Threshold for using Web Worker (rows). Below this, sync sort is used. */
const WORKER_THRESHOLD = 200000;

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
  /** Clear all data from the data source. */
  clear(): void;
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
  /** Use Web Worker for sorting large datasets (default: true) */
  useWorker?: boolean;
  /** Options for parallel sorting (only used when useWorker is true) */
  parallelSort?: ParallelSortOptions | false;
}

// =============================================================================
// Mutable Client Data Source
// =============================================================================

/**
 * Creates a mutable client-side data source with transaction support.
 * Uses IndexedDataStore for efficient incremental operations.
 * For large datasets, sorting is automatically offloaded to a Web Worker.
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
    useWorker = true,
    parallelSort,
  } = options;

  // Create the indexed data store
  const store = new IndexedDataStore(data, {
    getRowId,
    getFieldValue: getFieldValue ?? ((row, field) => {
      const parts = field.split(".");
      let value: unknown = row;
      for (const part of parts) {
        if (value == null || typeof value !== "object") {
          return null;
        }
        value = (value as Record<string, unknown>)[part];
      }
      return (value ?? null) as CellValue;
    }),
  });

  // Subscribers for data change notifications
  const subscribers = new Set<DataChangeListener>();

  // Create instruction emitter for DATA_LOADING/DATA_LOADED
  const instructionEmitter = createInstructionEmitter();
  const emit = instructionEmitter.emit;

  // Create parallel sort manager only if useWorker is enabled
  // parallelSort: false disables parallel sorting, undefined or object enables it
  const sortManager = useWorker
    ? new ParallelSortManager(parallelSort === false ? { maxWorkers: 1 } : parallelSort)
    : null;

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
        emit({ type: "DATA_LOADING" });
        try {
          await transactionManager.flush();
        } finally {
          emit({ type: "DATA_LOADED", totalRows: store.getTotalRowCount() });
        }
      }

      // Get all data directly from store for sorting and filtering
      let processedData = store.getAllRows();

      // Define field accessor for use in filtering and sorting
      const fieldAccessor = getFieldValue ?? ((row, field) => {
        const parts = field.split(".");
        let value: unknown = row;
        for (const part of parts) {
          if (value == null || typeof value !== "object") {
            return null;
          }
          value = (value as Record<string, unknown>)[part];
        }
        return (value ?? null) as CellValue;
      });

      // Apply filters (always sync - filtering is fast)
      if (request.filter && Object.keys(request.filter).length > 0) {
        processedData = applyFilters(processedData, request.filter, fieldAccessor);
      }

      // Apply sorting (async with worker for large datasets, sync for small)
      if (request.sort && request.sort.length > 0) {
        const canUseWorkerSort =
          sortManager &&
          sortManager.isAvailable() &&
          processedData.length >= WORKER_THRESHOLD;

        if (canUseWorkerSort) {
          emit({ type: "DATA_LOADING" });
          try {
            let sortedIndices: Uint32Array;

            // For single-column string sorting, use multi-hash approach
            if (request.sort.length === 1) {
              const { colId, direction } = request.sort[0]!;

              // Detect column type - arrays are treated as string columns
              let isStringColumn = false;
              for (const row of processedData) {
                const val = fieldAccessor(row, colId);
                if (val != null) {
                  isStringColumn = typeof val === "string" || Array.isArray(val);
                  break;
                }
              }

              if (isStringColumn) {
                // Use multi-hash sorting for strings
                const originalStrings: string[] = [];
                const hashChunks: number[][] = Array.from(
                  { length: HASH_CHUNK_COUNT },
                  () => [],
                );

                for (const row of processedData) {
                  const val = fieldAccessor(row, colId);
                  const str = val == null ? "" : Array.isArray(val) ? val.join(', ') : String(val);
                  originalStrings.push(str);
                  const hashes = stringToSortableHashes(str);
                  for (let c = 0; c < HASH_CHUNK_COUNT; c++) {
                    hashChunks[c]!.push(hashes[c]!);
                  }
                }

                // Convert to Float64Arrays for transfer to worker
                const hashChunkArrays = hashChunks.map(
                  (chunk) => new Float64Array(chunk),
                );

                sortedIndices = await sortManager.sortStringHashes(
                  hashChunkArrays,
                  direction,
                  originalStrings,
                );
              } else {
                // Use single-value sorting for numeric columns
                const values = processedData.map((row) => {
                  const val = fieldAccessor(row, colId);
                  return toSortableNumber(val);
                });
                sortedIndices = await sortManager.sortIndices(values, direction);
              }
            } else {
              // Multi-column sorting: use single hash per value
              const columnValues: number[][] = [];
              const directions: Array<"asc" | "desc"> = [];

              for (const { colId, direction } of request.sort) {
                const values = processedData.map((row) => {
                  const val = fieldAccessor(row, colId);
                  return toSortableNumber(val);
                });
                columnValues.push(values);
                directions.push(direction);
              }

              sortedIndices = await sortManager.sortMultiColumn(columnValues, directions);
            }

            // Reorder data using sorted indices
            const reordered = new Array<TData>(processedData.length);
            for (let i = 0; i < sortedIndices.length; i++) {
              const sourceIndex = sortedIndices[i]!;
              reordered[i] = processedData[sourceIndex]!;
            }
            processedData = reordered;
          } finally {
            emit({ type: "DATA_LOADED", totalRows: processedData.length });
          }
        } else {
          // Use sync sorting for small datasets or when worker is unavailable
          processedData = applySort(processedData, request.sort, fieldAccessor);
        }
      }

      const totalRows = processedData.length;

      // Apply pagination
      const { pageIndex, pageSize } = request.pagination;
      const startIndex = pageIndex * pageSize;
      const rows = processedData.slice(startIndex, startIndex + pageSize);

      return { rows, totalRows };
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

    clear(): void {
      store.clear();
      subscribers.clear();
    },
  };
}
