// packages/core/src/data-source/client-data-source.ts

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  CellValue,
} from "../types";
import { ParallelSortManager, type ParallelSortOptions } from "../sorting";
import { applySort } from "../indexed-data-store/sorting";
import { performWorkerSort } from "./worker-sort";
import { applyFilters } from "../filtering";

// =============================================================================
// Configuration
// =============================================================================

/** Threshold for using Web Worker (rows). Below this, sync sort is used. */
const WORKER_THRESHOLD = 200000;

// =============================================================================
// Field Value Accessor
// =============================================================================

/**
 * Default field value accessor supporting dot-notation for nested properties
 */
export function defaultGetFieldValue<TData>(row: TData, field: string): CellValue {
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

// =============================================================================
// Client Data Source
// =============================================================================

export interface ClientDataSourceOptions<TData> {
  /** Custom field accessor for nested properties */
  getFieldValue?: (row: TData, field: string) => CellValue;
  /**
   * Lookup for a field's valueFormatter. Lets text filter conditions compare
   * against the displayed (formatted) value so that what the user sees in the
   * grid matches what the filter popup selects against.
   */
  getValueFormatter?: (field: string) => ((v: CellValue) => string) | undefined;
  /** Use Web Worker for sorting large datasets (default: true) */
  useWorker?: boolean;
  /** Options for parallel sorting (only used when useWorker is true) */
  parallelSort?: ParallelSortOptions | false;
}

/**
 * Creates a client-side data source that holds all data in memory.
 * Sorting and filtering are performed client-side.
 * For large datasets, sorting is automatically offloaded to a Web Worker.
 */
export function createClientDataSource<TData = unknown>(
  data: TData[],
  options: ClientDataSourceOptions<TData> = {},
): DataSource<TData> {
  const {
    getFieldValue = defaultGetFieldValue,
    getValueFormatter,
    useWorker = true,
    parallelSort,
  } = options;

  // Mutable reference so we can clear it on destroy
  let internalData: TData[] | null = data;

  // Lifecycle state for idempotent destroy
  let isDestroyed = false;

  // Create parallel sort manager only if useWorker is enabled
  // parallelSort: false disables parallel sorting, undefined or object enables it
  const sortOptions = parallelSort === false ? { maxWorkers: 1 } : parallelSort;
  const sortManager = useWorker ? new ParallelSortManager(sortOptions) : null;

  return {
    async fetch(
      request: DataSourceRequest,
    ): Promise<DataSourceResponse<TData>> {
      // Use internalData which can be cleared on destroy
      let processedData = internalData ? [...internalData] : [];

      // Apply filters (always sync - filtering is fast)
      if (request.filter && Object.keys(request.filter).length > 0) {
        const formatterLookup =
          request.valueFormatters != null
            ? (field: string) => request.valueFormatters?.[field]
            : getValueFormatter;
        processedData = applyFilters(
          processedData,
          request.filter,
          getFieldValue,
          formatterLookup,
        );
      }

      // Apply sorting (async with worker for large datasets)
      if (request.sort && request.sort.length > 0) {
        const canUseWorkerSort =
          sortManager &&
          sortManager.isAvailable() &&
          processedData.length >= WORKER_THRESHOLD;

        processedData = canUseWorkerSort
          ? await performWorkerSort(processedData, request.sort, sortManager, getFieldValue)
          : applySort(processedData, request.sort, getFieldValue);
      }

      const totalRows = processedData.length;

      // Apply pagination
      const { pageIndex, pageSize } = request.pagination;
      const startIndex = pageIndex * pageSize;
      const rows = processedData.slice(startIndex, startIndex + pageSize);

      return { rows, totalRows };
    },

    destroy(): void {
      // Idempotent - safe to call multiple times
      if (isDestroyed) return;
      isDestroyed = true;

      // Clear data reference to allow garbage collection
      internalData = null;

      // Terminate sort manager to clean up Web Workers
      if (sortManager) {
        sortManager.terminate();
      }
    },

    moveRow(fromIndex: number, toIndex: number): void {
      if (!internalData || fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= internalData.length) return;
      if (toIndex < 0 || toIndex > internalData.length) return;
      const [row] = internalData.splice(fromIndex, 1);
      const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
      internalData.splice(adjustedTo, 0, row!);
    },
  };
}

// =============================================================================
// Legacy: Create Data Source from Array
// =============================================================================

/**
 * Convenience function to create a data source from an array.
 * This provides backwards compatibility with the old `rowData` prop.
 */
export function createDataSourceFromArray<TData = unknown>(
  data: TData[],
): DataSource<TData> {
  return createClientDataSource(data);
}
