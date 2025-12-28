// gp-grid-core/src/data-source.ts

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  Row,
  RowId,
  SortModel,
  FilterModel,
  CellValue,
} from "./types";
import { SortWorkerManager } from "./worker-manager";
import { IndexedDataStore } from "./indexed-data-store";
import {
  TransactionManager,
  type TransactionResult,
} from "./transaction-manager";

// =============================================================================
// Configuration
// =============================================================================

/** Threshold for using Web Worker (rows). Below this, sync sort is used. */
const WORKER_THRESHOLD = 200000;

/** Number of 10-character chunks for string hashing (30 chars total) */
const HASH_CHUNK_COUNT = 3;

// =============================================================================
// Client Data Source (In-Memory)
// =============================================================================

/**
 * Creates a client-side data source that holds all data in memory.
 * Sorting and filtering are performed client-side.
 * For large datasets, sorting is automatically offloaded to a Web Worker.
 */
export function createClientDataSource<TData extends Row = Row>(
  data: TData[],
  options: {
    /** Custom field accessor for nested properties */
    getFieldValue?: (row: TData, field: string) => CellValue;
    /** Use Web Worker for sorting large datasets (default: true) */
    useWorker?: boolean;
  } = {},
): DataSource<TData> {
  const { getFieldValue = defaultGetFieldValue, useWorker = true } = options;

  // Create worker manager only if useWorker is enabled
  const workerManager = useWorker ? new SortWorkerManager() : null;

  return {
    async fetch(
      request: DataSourceRequest,
    ): Promise<DataSourceResponse<TData>> {
      let processedData = [...data];

      // Apply filters (always sync - filtering is fast)
      if (request.filter && Object.keys(request.filter).length > 0) {
        processedData = applyFilters(
          processedData,
          request.filter,
          getFieldValue,
        );
      }

      // Apply sorting (async with worker for large datasets)
      if (request.sort && request.sort.length > 0) {
        // Use worker-based index sorting for large datasets (all column types)
        const canUseWorkerSort =
          workerManager &&
          workerManager.isAvailable() &&
          processedData.length >= WORKER_THRESHOLD;

        if (canUseWorkerSort) {
          let sortedIndices: Uint32Array;

          // For single-column string sorting, use multi-hash approach with collision fallback
          if (request.sort.length === 1) {
            const { colId, direction } = request.sort[0]!;

            // Detect column type by sampling first non-null value
            let isStringColumn = false;
            for (const row of processedData) {
              const val = getFieldValue(row, colId);
              if (val != null) {
                isStringColumn = typeof val === "string";
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
                const val = getFieldValue(row, colId);
                const str = val == null ? "" : String(val);
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

              sortedIndices = await workerManager.sortStringHashes(
                hashChunkArrays,
                direction,
                originalStrings,
              );
            } else {
              // Use single-value sorting for numeric columns
              const values = processedData.map((row) => {
                const val = getFieldValue(row, colId);
                return toSortableNumber(val);
              });
              sortedIndices = await workerManager.sortIndices(
                values,
                direction,
              );
            }
          } else {
            // Multi-column sorting: use single hash per value (existing approach)
            const columnValues: number[][] = [];
            const directions: Array<"asc" | "desc"> = [];

            for (const { colId, direction } of request.sort) {
              const values = processedData.map((row) => {
                const val = getFieldValue(row, colId);
                return toSortableNumber(val);
              });
              columnValues.push(values);
              directions.push(direction);
            }

            sortedIndices = await workerManager.sortMultiColumn(
              columnValues,
              directions,
            );
          }

          // Reorder data using sorted indices
          const reordered = new Array<TData>(processedData.length);
          for (let i = 0; i < sortedIndices.length; i++) {
            reordered[i] = processedData[sortedIndices[i]!]!;
          }
          processedData = reordered;
        } else {
          // Use sync sorting for small datasets or when worker is unavailable
          processedData = applySort(processedData, request.sort, getFieldValue);
        }
      }

      const totalRows = processedData.length;

      // Apply pagination
      const { pageIndex, pageSize } = request.pagination;
      const startIndex = pageIndex * pageSize;
      const rows = processedData.slice(startIndex, startIndex + pageSize);

      return { rows, totalRows };
    },
  };
}

// =============================================================================
// Server Data Source
// =============================================================================

export type ServerFetchFunction<TData> = (
  request: DataSourceRequest,
) => Promise<DataSourceResponse<TData>>;

/**
 * Creates a server-side data source that delegates all operations to the server.
 * The fetch function receives sort/filter/pagination params to pass to the API.
 */
export function createServerDataSource<TData extends Row = Row>(
  fetchFn: ServerFetchFunction<TData>,
): DataSource<TData> {
  return {
    async fetch(
      request: DataSourceRequest,
    ): Promise<DataSourceResponse<TData>> {
      return fetchFn(request);
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert any cell value to a sortable number.
 * Strings are converted using a lexicographic hash of the first 8 characters.
 * This preserves sort order for strings that differ within the first 8 chars.
 */
function toSortableNumber(val: CellValue): number {
  if (val == null) return Number.MAX_VALUE; // nulls sort last

  // Numbers pass through directly
  if (typeof val === "number") return val;

  // Dates convert to timestamp
  if (val instanceof Date) return val.getTime();

  // Strings: convert to lexicographic hash
  if (typeof val === "string") {
    return stringToSortableNumber(val);
  }

  // Fallback: try to convert to number
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

/**
 * Convert a string to a sortable number using first 10 characters.
 * Uses base 36 (alphanumeric) to fit more characters within float64 safe precision.
 * (36^10 ≈ 3.6×10¹⁵, within MAX_SAFE_INTEGER ~9×10¹⁵)
 * This allows sorting strings that share long prefixes (e.g., "Person Giuseppe" vs "Person Giovanni").
 */
function stringToSortableNumber(str: string): number {
  const s = str.toLowerCase();
  const len = Math.min(s.length, 10);
  let hash = 0;

  // Pack characters into a number using base 36 encoding
  // Maps a-z to 0-25, 0-9 to 26-35, space/other to 0
  for (let i = 0; i < len; i++) {
    const code = s.charCodeAt(i);
    let mapped: number;
    if (code >= 97 && code <= 122) {
      // a-z -> 0-25
      mapped = code - 97;
    } else if (code >= 48 && code <= 57) {
      // 0-9 -> 26-35
      mapped = code - 48 + 26;
    } else {
      // space and other chars -> 0 (sorts first)
      mapped = 0;
    }
    hash = hash * 36 + mapped;
  }

  // Pad shorter strings to ensure "a" < "ab"
  for (let i = len; i < 10; i++) {
    hash = hash * 36;
  }

  return hash;
}

/**
 * Convert a string to multiple sortable hash values (one per 10-char chunk).
 * This allows correct sorting of strings longer than 10 characters.
 * Returns HASH_CHUNK_COUNT hashes, each covering 10 characters.
 */
function stringToSortableHashes(str: string): number[] {
  const s = str.toLowerCase();
  const hashes: number[] = [];

  for (let chunk = 0; chunk < HASH_CHUNK_COUNT; chunk++) {
    const start = chunk * 10;
    let hash = 0;

    for (let i = 0; i < 10; i++) {
      const charIndex = start + i;
      const code = charIndex < s.length ? s.charCodeAt(charIndex) : 0;
      let mapped: number;
      if (code >= 97 && code <= 122) {
        // a-z -> 0-25
        mapped = code - 97;
      } else if (code >= 48 && code <= 57) {
        // 0-9 -> 26-35
        mapped = code - 48 + 26;
      } else {
        // space and other chars -> 0 (sorts first)
        mapped = 0;
      }
      hash = hash * 36 + mapped;
    }
    hashes.push(hash);
  }

  return hashes;
}

function defaultGetFieldValue<TData>(row: TData, field: string): CellValue {
  const parts = field.split(".");
  let value: unknown = row;

  for (const part of parts) {
    if (value == null || typeof value !== "object") {
      return null;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return (value ?? null) as CellValue;
}

function applyFilters<TData>(
  data: TData[],
  filterModel: FilterModel,
  getFieldValue: (row: TData, field: string) => CellValue,
): TData[] {
  const filterEntries = Object.entries(filterModel).filter(
    ([, value]) => value !== "",
  );

  if (filterEntries.length === 0) {
    return data;
  }

  return data.filter((row) => {
    for (const [field, filterValue] of filterEntries) {
      const cellValue = getFieldValue(row, field);
      const cellStr = String(cellValue ?? "").toLowerCase();
      const filterStr = filterValue.toLowerCase();

      if (!cellStr.includes(filterStr)) {
        return false;
      }
    }
    return true;
  });
}

function applySort<TData>(
  data: TData[],
  sortModel: SortModel[],
  getFieldValue: (row: TData, field: string) => CellValue,
): TData[] {
  return [...data].sort((a, b) => {
    for (const { colId, direction } of sortModel) {
      const aVal = getFieldValue(a, colId);
      const bVal = getFieldValue(b, colId);
      const comparison = compareValues(aVal, bVal);

      if (comparison !== 0) {
        return direction === "asc" ? comparison : -comparison;
      }
    }
    return 0;
  });
}

function compareValues(a: CellValue, b: CellValue): number {
  // Null handling
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Numeric comparison
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // String comparison
  return String(a).localeCompare(String(b));
}

// =============================================================================
// Utility: Create Data Source from Array (Legacy Support)
// =============================================================================

/**
 * Convenience function to create a data source from an array.
 * This provides backwards compatibility with the old `rowData` prop.
 */
export function createDataSourceFromArray<TData extends Row = Row>(
  data: TData[],
): DataSource<TData> {
  return createClientDataSource(data);
}

// =============================================================================
// Mutable Client Data Source
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
