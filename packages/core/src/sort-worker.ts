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
  }
};
`;

// =============================================================================
// Export for use as module worker (if bundler supports it)
// =============================================================================

// This handles incoming messages when running as a module worker
declare const self: DedicatedWorkerGlobalScope;

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
