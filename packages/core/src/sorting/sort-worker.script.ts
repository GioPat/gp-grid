// @gp-grid/core/src/sorting/sort-worker.script.ts
// Source of the sort Web Worker. Never imported by the main bundle: it is
// bundled + minified by scripts/build-worker.ts into sort-worker-code.ts
// (`SORT_WORKER_CODE`), which WorkerPool turns into a Blob URL at runtime.
// sort-worker-code.ts is a git-ignored artifact regenerated on install, build
// and test — if it is missing, run `pnpm build:worker`.
// Keep it self-contained: helpers are intentionally not imported from the
// main-thread modules so the worker sort semantics stay independent.
//
// Shape: shared helpers → base sort primitives → chunk variants (reuse base
// + reorder) → dispatch table → single onmessage that looks up the handler.

import type { CellValue, SortModel } from "../types";
import type {
  SortWorkerMessage,
  SortWorkerRequest,
  SortIndicesRequest,
  SortMultiColumnRequest,
  SortStringHashesRequest,
  SortChunkRequest,
  SortStringChunkRequest,
  SortMultiColumnChunkRequest,
} from "./sort-worker-messages";

type Direction = "asc" | "desc";

// ---- Shared helpers ---------------------------------------------------------

const getFieldValue = (row: unknown, field: string): CellValue => {
  let value: unknown = row;
  for (const part of field.split(".")) {
    if (value == null || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[part];
  }
  return (value as CellValue) ?? null;
};

const toDisplayString = (v: CellValue): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return String(v);
};

const compareValues = (a: CellValue, b: CellValue): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return toDisplayString(a).localeCompare(toDisplayString(b));
};

const sortData = <T>(data: T[], sortModel: SortModel[]): T[] =>
  [...data].sort((a, b) => {
    for (const { colId, direction } of sortModel) {
      const cmp = compareValues(getFieldValue(a, colId), getFieldValue(b, colId));
      if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });

const initIndices = (length: number): Uint32Array => {
  const indices = new Uint32Array(length);
  for (let i = 0; i < length; i++) indices[i] = i;
  return indices;
};

const reorderFloat64 = (values: Float64Array, indices: Uint32Array): Float64Array => {
  const out = new Float64Array(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = values[indices[i]!]!;
  return out;
};

const hashTuplesDiffer = (hashChunks: Float64Array[], p: number, c: number): boolean =>
  hashChunks.some((chunk) => chunk[p] !== chunk[c]);

/**
 * Find runs of consecutive sorted indices whose hash tuples are identical.
 * Emits flat pairs: [start1, end1, start2, end2, ...].
 */
const detectCollisionRuns = (indices: Uint32Array, hashChunks: Float64Array[]): Uint32Array => {
  const length = indices.length;
  const runs: number[] = [];
  let runStart = 0;
  for (let i = 1; i <= length; i++) {
    const boundary = i === length || hashTuplesDiffer(hashChunks, indices[i - 1]!, indices[i]!);
    if (boundary) {
      if (i - runStart > 1) runs.push(runStart, i);
      runStart = i;
    }
  }
  return new Uint32Array(runs);
};

// ---- Base sort primitives ---------------------------------------------------
// Every comparator ends with `a - b` so ties preserve original (local) order,
// which keeps the whole parallel sort stable.

const sortIndices = (values: Float64Array, direction: Direction): Uint32Array => {
  const indices = initIndices(values.length);
  const mult = direction === "asc" ? 1 : -1;
  indices.sort((a, b) => {
    const va = values[a]!;
    const vb = values[b]!;
    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;
    return a - b;
  });
  return indices;
};

const sortMultiColumn = (columns: Float64Array[], directions: Int8Array): Uint32Array => {
  const numCols = columns.length;
  const indices = initIndices(columns[0]!.length);
  indices.sort((a, b) => {
    for (let c = 0; c < numCols; c++) {
      const va = columns[c]![a]!;
      const vb = columns[c]![b]!;
      if (va < vb) return -1 * directions[c]!;
      if (va > vb) return 1 * directions[c]!;
    }
    return a - b;
  });
  return indices;
};

const sortStringHashes = (
  hashChunks: Float64Array[],
  direction: Direction,
): { indices: Uint32Array; collisionRuns: Uint32Array } => {
  const numChunks = hashChunks.length;
  const indices = initIndices(hashChunks[0]!.length);
  const mult = direction === "asc" ? 1 : -1;
  indices.sort((a, b) => {
    for (let c = 0; c < numChunks; c++) {
      const va = hashChunks[c]![a]!;
      const vb = hashChunks[c]![b]!;
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
    }
    return a - b;
  });
  return { indices, collisionRuns: detectCollisionRuns(indices, hashChunks) };
};

// ---- Dispatch table: type → handler(request) → { type, payload, transfer }

interface HandlerResult {
  type: string;
  payload: Record<string, unknown>;
  transfer: Transferable[];
}

type Handlers = {
  [K in SortWorkerMessage["type"]]: (
    request: Extract<SortWorkerMessage, { type: K }>,
  ) => HandlerResult;
};

const HANDLERS: Handlers = {
  sort: (d: SortWorkerRequest) => ({
    type: "sorted",
    payload: { data: sortData(d.data, d.sortModel) },
    transfer: [],
  }),
  sortIndices: (d: SortIndicesRequest) => {
    const indices = sortIndices(d.values, d.direction);
    return { type: "sortedIndices", payload: { indices }, transfer: [indices.buffer] };
  },
  sortMultiColumn: (d: SortMultiColumnRequest) => {
    const indices = sortMultiColumn(d.columns, d.directions);
    return { type: "sortedMultiColumn", payload: { indices }, transfer: [indices.buffer] };
  },
  sortStringHashes: (d: SortStringHashesRequest) => {
    const r = sortStringHashes(d.hashChunks, d.direction);
    return {
      type: "sortedStringHashes",
      payload: { indices: r.indices, collisionRuns: r.collisionRuns },
      transfer: [r.indices.buffer, r.collisionRuns.buffer],
    };
  },
  sortChunk: (d: SortChunkRequest) => {
    const indices = sortIndices(d.values, d.direction);
    const sortedValues = reorderFloat64(d.values, indices);
    return {
      type: "sortedChunk",
      payload: { indices, sortedValues, chunkOffset: d.chunkOffset },
      transfer: [indices.buffer, sortedValues.buffer],
    };
  },
  sortStringChunk: (d: SortStringChunkRequest) => {
    const r = sortStringHashes(d.hashChunks, d.direction);
    // Only the first hash chunk is needed for merge comparison.
    const sortedHashes = reorderFloat64(d.hashChunks[0]!, r.indices);
    return {
      type: "sortedStringChunk",
      payload: {
        indices: r.indices,
        sortedHashes,
        collisionRuns: r.collisionRuns,
        chunkOffset: d.chunkOffset,
      },
      transfer: [r.indices.buffer, sortedHashes.buffer, r.collisionRuns.buffer],
    };
  },
  sortMultiColumnChunk: (d: SortMultiColumnChunkRequest) => {
    const indices = sortMultiColumn(d.columns, d.directions);
    const sortedColumns = d.columns.map((col) => reorderFloat64(col, indices));
    return {
      type: "sortedMultiColumnChunk",
      payload: { indices, sortedColumns, chunkOffset: d.chunkOffset },
      transfer: [indices.buffer, ...sortedColumns.map((c) => c.buffer)],
    };
  },
};

// ---- Worker entry -----------------------------------------------------------

interface WorkerScope {
  onmessage: ((event: MessageEvent<SortWorkerMessage>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

// `self` is typed as Window under the DOM lib; narrow it to what a worker offers.
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  const handler = HANDLERS[request.type] as ((r: SortWorkerMessage) => HandlerResult) | undefined;
  if (!handler) return;
  try {
    const result = handler(request);
    scope.postMessage({ type: result.type, id: request.id, ...result.payload }, result.transfer);
  } catch (error) {
    scope.postMessage({ type: "error", id: request.id, error: String(error) });
  }
};
