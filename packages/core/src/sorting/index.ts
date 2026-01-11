// packages/core/src/sorting/index.ts
// Re-exports all sorting-related functionality

// Parallel sort manager (recommended for large datasets)
export { ParallelSortManager } from "./parallel-sort-manager";
export type { ParallelSortOptions } from "./parallel-sort-manager";

// Worker pool
export { WorkerPool } from "./worker-pool";
export type { WorkerPoolOptions } from "./worker-pool";

// K-way merge utilities
export { kWayMerge, kWayMergeMultiColumn, detectBoundaryCollisions } from "./k-way-merge";
export type { SortedChunk, MultiColumnSortedChunk } from "./k-way-merge";

// Sort worker code (for custom worker implementations)
export { SORT_WORKER_CODE } from "./sort-worker";
export type {
  SortWorkerRequest,
  SortWorkerResponse,
  SortIndicesRequest,
  SortIndicesResponse,
  SortMultiColumnRequest,
  SortMultiColumnResponse,
  SortStringHashesRequest,
  SortStringHashesResponse,
  SortChunkRequest,
  SortChunkResponse,
  SortStringChunkRequest,
  SortStringChunkResponse,
  SortMultiColumnChunkRequest,
  SortMultiColumnChunkResponse,
} from "./sort-worker";
