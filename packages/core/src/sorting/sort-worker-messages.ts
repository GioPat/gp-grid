// @gp-grid/core/src/sorting/sort-worker-messages.ts
// Message contracts between ParallelSortManager and the sort Web Worker.
// The worker itself lives in sort-worker.script.ts (bundled into sort-worker-code.ts).
import type { SortModel } from "../types";

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

/** Every request the sort worker understands. */
export type SortWorkerMessage =
  | SortWorkerRequest
  | SortIndicesRequest
  | SortMultiColumnRequest
  | SortStringHashesRequest
  | SortChunkRequest
  | SortStringChunkRequest
  | SortMultiColumnChunkRequest;
