// gp-grid-core/src/sort-worker.ts
// Web Worker for sorting large datasets off the main thread

import type { SortModel, CellValue } from "./types";

// =============================================================================
// Worker Message Types
// =============================================================================

export interface SortWorkerRequest {
  type: "sort";
  id: number;
  data: unknown[];
  sortModel: SortModel[];
}

export interface SortIndicesRequest {
  type: "sortIndices";
  id: number;
  values: Float64Array;
  direction: "asc" | "desc";
}

export interface SortMultiColumnRequest {
  type: "sortMultiColumn";
  id: number;
  /** Array of column values, each as Float64Array */
  columns: Float64Array[];
  /** Direction for each column: 1 for asc, -1 for desc */
  directions: Int8Array;
}

export interface SortWorkerResponse {
  type: "sorted";
  id: number;
  data: unknown[];
}

export interface SortIndicesResponse {
  type: "sortedIndices";
  id: number;
  indices: Uint32Array;
}

export interface SortMultiColumnResponse {
  type: "sortedMultiColumn";
  id: number;
  indices: Uint32Array;
}

export interface SortStringHashesRequest {
  type: "sortStringHashes";
  id: number;
  /** Array of hash chunks: [chunk0Values, chunk1Values, chunk2Values] */
  hashChunks: Float64Array[];
  direction: "asc" | "desc";
}

export interface SortStringHashesResponse {
  type: "sortedStringHashes";
  id: number;
  indices: Uint32Array;
  /** Collision runs: [start1, end1, start2, end2, ...] for runs of identical hashes */
  collisionRuns: Uint32Array;
}

// =============================================================================
// Sorting Functions (duplicated from data-source.ts for worker isolation)
// =============================================================================

function getFieldValue(row: unknown, field: string): CellValue {
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

function sortData<T>(data: T[], sortModel: SortModel[]): T[] {
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

// =============================================================================
// Worker Code String (for inline worker creation)
// =============================================================================

/**
 * Inline worker code as a string for Blob URL creation.
 * This allows the worker to function without bundler-specific configuration.
 */
export const SORT_WORKER_CODE = `
// Inline sort worker code
function getFieldValue(row, field) {
  const parts = field.split(".");
  let value = row;

  for (const part of parts) {
    if (value == null || typeof value !== "object") {
      return null;
    }
    value = value[part];
  }

  return value ?? null;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  return String(a).localeCompare(String(b));
}

function sortData(data, sortModel) {
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

// Index-based sorting - much faster for large datasets
// Uses Transferable typed arrays for zero-copy transfer
function sortIndices(values, direction) {
  const len = values.length;
  const indices = new Uint32Array(len);
  for (let i = 0; i < len; i++) indices[i] = i;

  // Sort indices by values
  const mult = direction === "asc" ? 1 : -1;
  indices.sort((a, b) => {
    const va = values[a];
    const vb = values[b];
    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;
    return 0;
  });

  return indices;
}

// Multi-column sorting - compares columns in priority order
function sortMultiColumn(columns, directions) {
  const len = columns[0].length;
  const numCols = columns.length;
  const indices = new Uint32Array(len);
  for (let i = 0; i < len; i++) indices[i] = i;

  indices.sort((a, b) => {
    for (let c = 0; c < numCols; c++) {
      const va = columns[c][a];
      const vb = columns[c][b];
      if (va < vb) return -1 * directions[c];
      if (va > vb) return 1 * directions[c];
      // Equal - continue to next column
    }
    return 0;
  });

  return indices;
}

// String hash sorting with collision detection
function sortStringHashes(hashChunks, direction) {
  const len = hashChunks[0].length;
  const numChunks = hashChunks.length;
  const indices = new Uint32Array(len);
  for (let i = 0; i < len; i++) indices[i] = i;

  const mult = direction === "asc" ? 1 : -1;

  // Sort by hash only (no collision tracking during sort)
  indices.sort((a, b) => {
    for (let c = 0; c < numChunks; c++) {
      const va = hashChunks[c][a];
      const vb = hashChunks[c][b];
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
    }
    return 0; // Stable sort preserves original order
  });

  // Detect collision runs AFTER sorting (much more efficient)
  // Find runs of consecutive indices with identical hashes
  const collisionRuns = []; // [start1, end1, start2, end2, ...]
  let runStart = 0;

  for (let i = 1; i <= len; i++) {
    // Check if current element has different hash than previous
    let isDifferent = i === len; // End of array is always "different"
    if (!isDifferent) {
      const prevIdx = indices[i - 1];
      const currIdx = indices[i];
      for (let c = 0; c < numChunks; c++) {
        if (hashChunks[c][prevIdx] !== hashChunks[c][currIdx]) {
          isDifferent = true;
          break;
        }
      }
    }

    if (isDifferent) {
      // End of a run - only record if run has more than 1 element
      if (i - runStart > 1) {
        collisionRuns.push(runStart, i);
      }
      runStart = i;
    }
  }

  return { indices, collisionRuns: new Uint32Array(collisionRuns) };
}

self.onmessage = function(e) {
  const { type, id } = e.data;

  if (type === "sort") {
    try {
      const { data, sortModel } = e.data;
      const sorted = sortData(data, sortModel);
      self.postMessage({ type: "sorted", id, data: sorted });
    } catch (error) {
      self.postMessage({ type: "error", id, error: String(error) });
    }
  } else if (type === "sortIndices") {
    try {
      const { values, direction } = e.data;
      const indices = sortIndices(values, direction);
      // Transfer the indices buffer back (zero-copy)
      self.postMessage({ type: "sortedIndices", id, indices }, [indices.buffer]);
    } catch (error) {
      self.postMessage({ type: "error", id, error: String(error) });
    }
  } else if (type === "sortMultiColumn") {
    try {
      const { columns, directions } = e.data;
      const indices = sortMultiColumn(columns, directions);
      self.postMessage({ type: "sortedMultiColumn", id, indices }, [indices.buffer]);
    } catch (error) {
      self.postMessage({ type: "error", id, error: String(error) });
    }
  } else if (type === "sortStringHashes") {
    try {
      const { hashChunks, direction } = e.data;
      const result = sortStringHashes(hashChunks, direction);
      self.postMessage(
        { type: "sortedStringHashes", id, indices: result.indices, collisionRuns: result.collisionRuns },
        [result.indices.buffer, result.collisionRuns.buffer]
      );
    } catch (error) {
      self.postMessage({ type: "error", id, error: String(error) });
    }
  }
};
`;

// =============================================================================
// Export for use as module worker (if bundler supports it)
// =============================================================================

// This handles incoming messages when running as a module worker
interface WorkerGlobalScopeMinimal {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
declare const self: WorkerGlobalScopeMinimal;

if (typeof self !== "undefined" && typeof self.onmessage !== "undefined") {
  self.onmessage = (e: MessageEvent<SortWorkerRequest>) => {
    const { type, id, data, sortModel } = e.data;

    if (type === "sort") {
      try {
        const sorted = sortData(data, sortModel);
        self.postMessage({ type: "sorted", id, data: sorted } as SortWorkerResponse);
      } catch (error) {
        self.postMessage({ type: "error", id, error: String(error) });
      }
    }
  };
}
