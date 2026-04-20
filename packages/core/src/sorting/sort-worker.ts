// @gp-grid/core/src/sorting/sort-worker.ts
// Web Worker for sorting large datasets off the main thread

import type { SortModel, CellValue } from "../types";

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
// Chunk-aware Message Types (for parallel sorting)
// =============================================================================

export interface SortChunkRequest {
  type: "sortChunk";
  id: number;
  values: Float64Array;
  direction: "asc" | "desc";
  /** Offset of this chunk in the original array */
  chunkOffset: number;
}

export interface SortChunkResponse {
  type: "sortedChunk";
  id: number;
  /** Sorted indices (local to this chunk) */
  indices: Uint32Array;
  /** Sorted values (reordered to match indices) */
  sortedValues: Float64Array;
  /** Offset echoed back for merge coordination */
  chunkOffset: number;
}

export interface SortStringChunkRequest {
  type: "sortStringChunk";
  id: number;
  hashChunks: Float64Array[];
  direction: "asc" | "desc";
  chunkOffset: number;
}

export interface SortStringChunkResponse {
  type: "sortedStringChunk";
  id: number;
  indices: Uint32Array;
  /** Sorted hash values for merge comparison (first hash chunk only for efficiency) */
  sortedHashes: Float64Array;
  collisionRuns: Uint32Array;
  chunkOffset: number;
}

export interface SortMultiColumnChunkRequest {
  type: "sortMultiColumnChunk";
  id: number;
  columns: Float64Array[];
  directions: Int8Array;
  chunkOffset: number;
}

export interface SortMultiColumnChunkResponse {
  type: "sortedMultiColumnChunk";
  id: number;
  indices: Uint32Array;
  /** Sorted column values for merge (reordered to match indices) */
  sortedColumns: Float64Array[];
  chunkOffset: number;
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

const toDisplayString = (v: CellValue): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return String(v);
};

function compareValues(a: CellValue, b: CellValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    return aNum - bNum;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  return toDisplayString(a).localeCompare(toDisplayString(b));
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
 *
 * Shape: shared helpers → base sort primitives → chunk variants (reuse base
 * + reorder) → dispatch table → single onmessage that looks up the handler.
 */
export const SORT_WORKER_CODE = `
// ---- Shared helpers (inlined for worker isolation) ----------------------
function getFieldValue(row, field) {
  const parts = field.split(".");
  let value = row;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return null;
    value = value[part];
  }
  return value ?? null;
}

function toDisplayString(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return String(v);
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return toDisplayString(a).localeCompare(toDisplayString(b));
}

function sortData(data, sortModel) {
  return [...data].sort((a, b) => {
    for (const { colId, direction } of sortModel) {
      const cmp = compareValues(getFieldValue(a, colId), getFieldValue(b, colId));
      if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

function initIndices(len) {
  const indices = new Uint32Array(len);
  for (let i = 0; i < len; i++) indices[i] = i;
  return indices;
}

function reorderFloat64(values, indices) {
  const out = new Float64Array(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = values[indices[i]];
  return out;
}

// Find runs of consecutive sorted indices whose hash tuples are identical.
// Emits flat pairs: [start1, end1, start2, end2, ...].
function detectCollisionRuns(indices, hashChunks) {
  const len = indices.length;
  const numChunks = hashChunks.length;
  const runs = [];
  let runStart = 0;
  for (let i = 1; i <= len; i++) {
    let diff = i === len;
    if (!diff) {
      const p = indices[i - 1];
      const c = indices[i];
      for (let k = 0; k < numChunks; k++) {
        if (hashChunks[k][p] !== hashChunks[k][c]) { diff = true; break; }
      }
    }
    if (diff) {
      if (i - runStart > 1) runs.push(runStart, i);
      runStart = i;
    }
  }
  return new Uint32Array(runs);
}

// ---- Base sort primitives ----------------------------------------------
function sortIndices(values, direction) {
  const indices = initIndices(values.length);
  const mult = direction === "asc" ? 1 : -1;
  indices.sort((a, b) => {
    const va = values[a], vb = values[b];
    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;
    return 0;
  });
  return indices;
}

function sortMultiColumn(columns, directions) {
  const numCols = columns.length;
  const indices = initIndices(columns[0].length);
  indices.sort((a, b) => {
    for (let c = 0; c < numCols; c++) {
      const va = columns[c][a], vb = columns[c][b];
      if (va < vb) return -1 * directions[c];
      if (va > vb) return 1 * directions[c];
    }
    return 0;
  });
  return indices;
}

function sortStringHashes(hashChunks, direction) {
  const numChunks = hashChunks.length;
  const indices = initIndices(hashChunks[0].length);
  const mult = direction === "asc" ? 1 : -1;
  indices.sort((a, b) => {
    for (let c = 0; c < numChunks; c++) {
      const va = hashChunks[c][a], vb = hashChunks[c][b];
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
    }
    return 0;
  });
  return { indices, collisionRuns: detectCollisionRuns(indices, hashChunks) };
}

// ---- Chunk variants (base sort + reorder for merge) --------------------
function sortChunk(values, direction) {
  const indices = sortIndices(values, direction);
  return { indices, sortedValues: reorderFloat64(values, indices) };
}

function sortStringChunk(hashChunks, direction) {
  const result = sortStringHashes(hashChunks, direction);
  return {
    indices: result.indices,
    sortedHashes: reorderFloat64(hashChunks[0], result.indices),
    collisionRuns: result.collisionRuns,
  };
}

function sortMultiColumnChunk(columns, directions) {
  const indices = sortMultiColumn(columns, directions);
  return { indices, sortedColumns: columns.map(col => reorderFloat64(col, indices)) };
}

// ---- Dispatch table: type → handler(data) → { type, payload, transfer }
const HANDLERS = {
  sort: (d) => ({
    type: "sorted",
    payload: { data: sortData(d.data, d.sortModel) },
  }),
  sortIndices: (d) => {
    const indices = sortIndices(d.values, d.direction);
    return { type: "sortedIndices", payload: { indices }, transfer: [indices.buffer] };
  },
  sortMultiColumn: (d) => {
    const indices = sortMultiColumn(d.columns, d.directions);
    return { type: "sortedMultiColumn", payload: { indices }, transfer: [indices.buffer] };
  },
  sortStringHashes: (d) => {
    const r = sortStringHashes(d.hashChunks, d.direction);
    return {
      type: "sortedStringHashes",
      payload: { indices: r.indices, collisionRuns: r.collisionRuns },
      transfer: [r.indices.buffer, r.collisionRuns.buffer],
    };
  },
  sortChunk: (d) => {
    const r = sortChunk(d.values, d.direction);
    return {
      type: "sortedChunk",
      payload: { indices: r.indices, sortedValues: r.sortedValues, chunkOffset: d.chunkOffset },
      transfer: [r.indices.buffer, r.sortedValues.buffer],
    };
  },
  sortStringChunk: (d) => {
    const r = sortStringChunk(d.hashChunks, d.direction);
    return {
      type: "sortedStringChunk",
      payload: {
        indices: r.indices,
        sortedHashes: r.sortedHashes,
        collisionRuns: r.collisionRuns,
        chunkOffset: d.chunkOffset,
      },
      transfer: [r.indices.buffer, r.sortedHashes.buffer, r.collisionRuns.buffer],
    };
  },
  sortMultiColumnChunk: (d) => {
    const r = sortMultiColumnChunk(d.columns, d.directions);
    return {
      type: "sortedMultiColumnChunk",
      payload: { indices: r.indices, sortedColumns: r.sortedColumns, chunkOffset: d.chunkOffset },
      transfer: [r.indices.buffer, ...r.sortedColumns.map(c => c.buffer)],
    };
  },
};

self.onmessage = function(e) {
  const { type, id } = e.data;
  const handler = HANDLERS[type];
  if (!handler) return;
  try {
    const result = handler(e.data);
    self.postMessage({ type: result.type, id, ...result.payload }, result.transfer || []);
  } catch (error) {
    self.postMessage({ type: "error", id, error: String(error) });
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

const workerScope = globalThis as unknown as Partial<WorkerGlobalScopeMinimal>;
if (workerScope.onmessage !== undefined) {
  workerScope.onmessage = (e: MessageEvent<SortWorkerRequest>) => {
    const { type, id, data, sortModel } = e.data;

    if (type === "sort") {
      try {
        const sorted = sortData(data, sortModel);
        workerScope.postMessage?.({ type: "sorted", id, data: sorted } as SortWorkerResponse);
      } catch (error) {
        workerScope.postMessage?.({ type: "error", id, error: String(error) });
      }
    }
  };
}
