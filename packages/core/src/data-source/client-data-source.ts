// packages/core/src/data-source/client-data-source.ts

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  Row,
  CellValue,
} from "../types";
import { ParallelSortManager, type ParallelSortOptions } from "../sorting";
import {
  toSortableNumber,
  stringToSortableHashes,
  applySort,
  HASH_CHUNK_COUNT,
} from "./sorting";
import { applyFilters } from "./filtering";

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
export function createClientDataSource<TData extends Row = Row>(
  data: TData[],
  options: ClientDataSourceOptions<TData> = {},
): DataSource<TData> {
  const { getFieldValue = defaultGetFieldValue, useWorker = true, parallelSort } = options;

  // Mutable reference so we can clear it on destroy
  let internalData: TData[] | null = data;

  // Lifecycle state for idempotent destroy
  let isDestroyed = false;

  // Create parallel sort manager only if useWorker is enabled
  // parallelSort: false disables parallel sorting, undefined or object enables it
  const sortManager = useWorker
    ? new ParallelSortManager(parallelSort === false ? { maxWorkers: 1 } : parallelSort)
    : null;

  return {
    async fetch(
      request: DataSourceRequest,
    ): Promise<DataSourceResponse<TData>> {
      // Use internalData which can be cleared on destroy
      let processedData = internalData ? [...internalData] : [];

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
        const canUseWorkerSort =
          sortManager &&
          sortManager.isAvailable() &&
          processedData.length >= WORKER_THRESHOLD;

        if (canUseWorkerSort) {
          let sortedIndices: Uint32Array;

          // For single-column string sorting, use multi-hash approach
          if (request.sort.length === 1) {
            const { colId, direction } = request.sort[0]!;

            // Detect column type - arrays are treated as string columns
            let isStringColumn = false;
            for (const row of processedData) {
              const val = getFieldValue(row, colId);
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
                const val = getFieldValue(row, colId);
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
                const val = getFieldValue(row, colId);
                return toSortableNumber(val);
              });
              sortedIndices = await sortManager.sortIndices(
                values,
                direction,
              );
            }
          } else {
            // Multi-column sorting: use single hash per value
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

            sortedIndices = await sortManager.sortMultiColumn(
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
      if (toIndex < 0 || toIndex >= internalData.length) return;
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
export function createDataSourceFromArray<TData extends Row = Row>(
  data: TData[],
): DataSource<TData> {
  return createClientDataSource(data);
}
