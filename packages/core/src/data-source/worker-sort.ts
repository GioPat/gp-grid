// packages/core/src/data-source/worker-sort.ts

import type { CellValue, SortModel } from "../types";
import type { ParallelSortManager } from "../sorting";
import {
  toSortableNumber,
  stringToSortableHashes,
  HASH_CHUNK_COUNT,
} from "../indexed-data-store/sorting";
import { formatCellValue } from "../utils/format-helpers";

// =============================================================================
// Types
// =============================================================================

type FieldAccessor<TData> = (row: TData, field: string) => CellValue;

interface StringHashData {
  originalStrings: string[];
  hashChunkArrays: Float64Array[];
}

interface MultiColumnSortData {
  columnValues: number[][];
  directions: Array<"asc" | "desc">;
}

// =============================================================================
// Column Type Detection
// =============================================================================

/**
 * Detects whether a column contains string/array values by sampling
 * the first non-null value.
 */
export const detectColumnType = <TData>(
  data: TData[],
  colId: string,
  getFieldValue: FieldAccessor<TData>,
): "string" | "numeric" => {
  for (const row of data) {
    const val = getFieldValue(row, colId);
    if (val != null) {
      const isStringLike =
        typeof val === "string" ||
        Array.isArray(val) ||
        (typeof val === "object" && !(val instanceof Date));
      return isStringLike ? "string" : "numeric";
    }
  }
  return "numeric";
};

// =============================================================================
// Sort Data Builders
// =============================================================================

const buildStringHashData = <TData>(
  data: TData[],
  colId: string,
  getFieldValue: FieldAccessor<TData>,
): StringHashData => {
  const originalStrings: string[] = [];
  const hashChunks: number[][] = Array.from(
    { length: HASH_CHUNK_COUNT },
    () => [],
  );

  for (const row of data) {
    const val = getFieldValue(row, colId);
    const str = formatCellValue(val);
    originalStrings.push(str);
    const hashes = stringToSortableHashes(str);
    for (let c = 0; c < HASH_CHUNK_COUNT; c++) {
      hashChunks[c]!.push(hashes[c]!);
    }
  }

  const hashChunkArrays = hashChunks.map(
    (chunk) => new Float64Array(chunk),
  );

  return { originalStrings, hashChunkArrays };
};

const buildNumericSortData = <TData>(
  data: TData[],
  colId: string,
  getFieldValue: FieldAccessor<TData>,
): number[] =>
  data.map((row) => toSortableNumber(getFieldValue(row, colId)));

const buildMultiColumnSortData = <TData>(
  data: TData[],
  sortModel: SortModel[],
  getFieldValue: FieldAccessor<TData>,
): MultiColumnSortData => {
  const columnValues: number[][] = [];
  const directions: Array<"asc" | "desc"> = [];

  for (const { colId, direction } of sortModel) {
    columnValues.push(
      data.map((row) => toSortableNumber(getFieldValue(row, colId))),
    );
    directions.push(direction ?? "asc");
  }

  return { columnValues, directions };
};

// =============================================================================
// Reorder
// =============================================================================

export const reorderByIndices = <TData>(
  data: TData[],
  sortedIndices: Uint32Array,
): TData[] => {
  const reordered = new Array<TData>(data.length);
  for (let i = 0; i < sortedIndices.length; i++) {
    reordered[i] = data[sortedIndices[i]!]!;
  }
  return reordered;
};

// =============================================================================
// Worker Sort Orchestration
// =============================================================================

const performSingleColumnWorkerSort = async <TData>(
  data: TData[],
  sort: SortModel,
  sortManager: ParallelSortManager,
  getFieldValue: FieldAccessor<TData>,
): Promise<Uint32Array> => {
  const { colId, direction: rawDirection } = sort;
  const direction = rawDirection ?? "asc";
  const columnType = detectColumnType(data, colId, getFieldValue);

  if (columnType === "string") {
    const { originalStrings, hashChunkArrays } = buildStringHashData(data, colId, getFieldValue);
    return sortManager.sortStringHashes(hashChunkArrays, direction, originalStrings);
  }

  const values = buildNumericSortData(data, colId, getFieldValue);
  return sortManager.sortIndices(values, direction);
};

const performMultiColumnWorkerSort = async <TData>(
  data: TData[],
  sortModel: SortModel[],
  sortManager: ParallelSortManager,
  getFieldValue: FieldAccessor<TData>,
): Promise<Uint32Array> => {
  const { columnValues, directions } = buildMultiColumnSortData(data, sortModel, getFieldValue);
  return sortManager.sortMultiColumn(columnValues, directions);
};

/**
 * Sorts data using a Web Worker via the ParallelSortManager.
 * Dispatches to single-column (string or numeric) or multi-column sort
 * based on the sort model.
 */
export const performWorkerSort = async <TData>(
  data: TData[],
  sortModel: SortModel[],
  sortManager: ParallelSortManager,
  getFieldValue: FieldAccessor<TData>,
): Promise<TData[]> => {
  const sortedIndices = sortModel.length === 1
    ? await performSingleColumnWorkerSort(data, sortModel[0]!, sortManager, getFieldValue)
    : await performMultiColumnWorkerSort(data, sortModel, sortManager, getFieldValue);

  return reorderByIndices(data, sortedIndices);
};
