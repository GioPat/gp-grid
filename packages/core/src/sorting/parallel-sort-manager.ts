// packages/core/src/sorting/parallel-sort-manager.ts
// Orchestrates parallel sorting using worker pool and k-way merge

import { WorkerPool } from './worker-pool';
import { SORT_WORKER_CODE } from './sort-worker';
import type {
  SortChunkRequest,
  SortChunkResponse,
  SortStringChunkRequest,
  SortStringChunkResponse,
  SortMultiColumnChunkRequest,
  SortMultiColumnChunkResponse,
  SortIndicesRequest,
  SortIndicesResponse,
  SortStringHashesRequest,
  SortStringHashesResponse,
  SortMultiColumnRequest,
  SortMultiColumnResponse,
} from './sort-worker';
import {
  kWayMerge,
  kWayMergeMultiColumn,
  type SortedChunk,
  type MultiColumnSortedChunk,
} from './k-way-merge';
import { calculateChunkBoundaries } from './chunk-splitter';
import {
  detectBoundaryCollisions,
  resolveCollisions,
} from './string-collision-resolver';

// =============================================================================
// Configuration
// =============================================================================

/** Threshold for using parallel sorting (rows). Below this, use single worker. */
const PARALLEL_THRESHOLD = 400_000;

/** Minimum chunk size to avoid overhead for small chunks */
const MIN_CHUNK_SIZE = 50_000;

// =============================================================================
// Types
// =============================================================================

export interface ParallelSortOptions {
  /** Maximum number of workers (default: navigator.hardwareConcurrency || 4) */
  maxWorkers?: number;
  /** Threshold for parallel sorting (default: 400000) */
  parallelThreshold?: number;
  /** Minimum chunk size (default: 50000) */
  minChunkSize?: number;
}

// =============================================================================
// ParallelSortManager
// =============================================================================

/**
 * Manages parallel sorting operations using a worker pool.
 * Automatically decides between single-worker and parallel sorting based on data size.
 */
export class ParallelSortManager {
  private readonly pool: WorkerPool;
  private readonly parallelThreshold: number;
  private readonly minChunkSize: number;
  private isTerminated = false;

  constructor(options: ParallelSortOptions = {}) {
    const maxWorkers = options.maxWorkers ??
      (navigator === undefined ? 4 : navigator.hardwareConcurrency) ?? 4;

    this.pool = new WorkerPool(SORT_WORKER_CODE, { maxWorkers });
    this.parallelThreshold = options.parallelThreshold ?? PARALLEL_THRESHOLD;
    this.minChunkSize = options.minChunkSize ?? MIN_CHUNK_SIZE;
  }

  isAvailable(): boolean {
    if (this.isTerminated) return false;
    return this.pool.isAvailable();
  }

  terminate(): void {
    this.pool.terminate();
    this.isTerminated = true;
  }

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  async sortIndices(
    values: number[],
    direction: "asc" | "desc",
  ): Promise<Uint32Array> {
    this.assertNotTerminated();
    if (values.length < this.parallelThreshold) {
      return this.sortIndicesSingle(values, direction);
    }
    return this.sortIndicesParallel(values, direction);
  }

  async sortStringHashes(
    hashChunks: Float64Array[],
    direction: "asc" | "desc",
    originalStrings: string[],
  ): Promise<Uint32Array> {
    this.assertNotTerminated();
    const length = hashChunks[0]?.length ?? 0;
    if (length < this.parallelThreshold) {
      return this.sortStringHashesSingle(hashChunks, direction, originalStrings);
    }
    return this.sortStringHashesParallel(hashChunks, direction, originalStrings);
  }

  async sortMultiColumn(
    columns: number[][],
    directions: ("asc" | "desc")[],
  ): Promise<Uint32Array> {
    this.assertNotTerminated();
    const length = columns[0]?.length ?? 0;
    if (length < this.parallelThreshold) {
      return this.sortMultiColumnSingle(columns, directions);
    }
    return this.sortMultiColumnParallel(columns, directions);
  }

  private assertNotTerminated(): void {
    if (this.isTerminated) {
      throw new Error("ParallelSortManager has been terminated");
    }
  }

  // ---------------------------------------------------------------------------
  // Single Worker Methods (for smaller datasets)
  // ---------------------------------------------------------------------------

  private async sortIndicesSingle(
    values: number[],
    direction: "asc" | "desc",
  ): Promise<Uint32Array> {
    const valuesArray = new Float64Array(values);
    const request: SortIndicesRequest = {
      type: "sortIndices",
      id: 0,
      values: valuesArray,
      direction,
    };
    const response = await this.pool.execute<SortIndicesRequest, SortIndicesResponse>(
      request,
      [valuesArray.buffer],
    );
    return response.indices;
  }

  private async sortStringHashesSingle(
    hashChunks: Float64Array[],
    direction: "asc" | "desc",
    originalStrings: string[],
  ): Promise<Uint32Array> {
    const request: SortStringHashesRequest = {
      type: "sortStringHashes",
      id: 0,
      hashChunks,
      direction,
    };
    const transferables = hashChunks.map((chunk) => chunk.buffer);
    const response = await this.pool.execute<
      SortStringHashesRequest,
      SortStringHashesResponse
    >(request, transferables);

    if (response.collisionRuns.length > 0) {
      resolveCollisions(response.indices, response.collisionRuns, originalStrings, direction);
    }
    return response.indices;
  }

  private async sortMultiColumnSingle(
    columns: number[][],
    directions: ("asc" | "desc")[],
  ): Promise<Uint32Array> {
    const columnArrays = columns.map((col) => new Float64Array(col));
    const directionArray = new Int8Array(directions.map((d) => (d === "asc" ? 1 : -1)));
    const request: SortMultiColumnRequest = {
      type: "sortMultiColumn",
      id: 0,
      columns: columnArrays,
      directions: directionArray,
    };
    const transferables = [...columnArrays.map((a) => a.buffer), directionArray.buffer];
    const response = await this.pool.execute<
      SortMultiColumnRequest,
      SortMultiColumnResponse
    >(request, transferables);
    return response.indices;
  }

  // ---------------------------------------------------------------------------
  // Parallel Sorting Methods (for large datasets)
  // ---------------------------------------------------------------------------

  private boundariesFor(length: number) {
    return calculateChunkBoundaries(length, this.pool.getMaxWorkers(), this.minChunkSize);
  }

  private async runChunks<
    TReq extends { id?: number },
    TResp extends { chunkOffset: number },
  >(
    tasks: Array<{ request: TReq; transferables: Transferable[] }>,
  ): Promise<TResp[]> {
    const responses = await this.pool.executeParallel<TReq, TResp>(tasks);
    responses.sort((a, b) => a.chunkOffset - b.chunkOffset);
    return responses;
  }

  private async sortIndicesParallel(
    values: number[],
    direction: "asc" | "desc",
  ): Promise<Uint32Array> {
    const boundaries = this.boundariesFor(values.length);

    const tasks = boundaries.map((boundary) => {
      const valuesArray = new Float64Array(
        values.slice(boundary.offset, boundary.offset + boundary.length),
      );
      const request: SortChunkRequest = {
        type: "sortChunk",
        id: 0,
        values: valuesArray,
        direction,
        chunkOffset: boundary.offset,
      };
      return { request, transferables: [valuesArray.buffer] };
    });

    const responses = await this.runChunks<SortChunkRequest, SortChunkResponse>(tasks);

    const sortedChunks: SortedChunk[] = responses.map((response) => ({
      indices: response.indices,
      values: response.sortedValues,
      offset: response.chunkOffset,
    }));
    return kWayMerge(sortedChunks, direction);
  }

  private async sortStringHashesParallel(
    hashChunks: Float64Array[],
    direction: "asc" | "desc",
    originalStrings: string[],
  ): Promise<Uint32Array> {
    const boundaries = this.boundariesFor(hashChunks[0]!.length);

    const tasks = boundaries.map((boundary) => {
      // Copy rather than view so each worker owns its hash-chunk buffer for transfer.
      const copiedChunks = hashChunks.map((hc) => {
        const copy = new Float64Array(boundary.length);
        copy.set(new Float64Array(hc.buffer, boundary.offset * 8, boundary.length));
        return copy;
      });
      const request: SortStringChunkRequest = {
        type: "sortStringChunk",
        id: 0,
        hashChunks: copiedChunks,
        direction,
        chunkOffset: boundary.offset,
      };
      return { request, transferables: copiedChunks.map((c) => c.buffer) };
    });

    const responses = await this.runChunks<SortStringChunkRequest, SortStringChunkResponse>(tasks);

    const sortedChunks: SortedChunk[] = responses.map((response) => ({
      indices: response.indices,
      values: response.sortedHashes,
      offset: response.chunkOffset,
    }));

    const intraChunkCollisions = collectIntraChunkCollisions(responses);
    const mergedIndices = kWayMerge(sortedChunks, direction);
    const boundaryRuns = detectBoundaryCollisions(sortedChunks);
    const combined = new Uint32Array([...intraChunkCollisions, ...boundaryRuns]);

    if (combined.length > 0) {
      resolveCollisions(mergedIndices, combined, originalStrings, direction);
    }
    return mergedIndices;
  }

  private async sortMultiColumnParallel(
    columns: number[][],
    directions: ("asc" | "desc")[],
  ): Promise<Uint32Array> {
    const boundaries = this.boundariesFor(columns[0]!.length);
    const directionArray = new Int8Array(directions.map((d) => (d === "asc" ? 1 : -1)));

    const tasks = boundaries.map((boundary) => {
      const chunkColumns = columns.map((col) => {
        const chunk = new Float64Array(boundary.length);
        for (let i = 0; i < boundary.length; i++) {
          chunk[i] = col[boundary.offset + i]!;
        }
        return chunk;
      });
      const dirCopy = new Int8Array(directionArray);
      const request: SortMultiColumnChunkRequest = {
        type: "sortMultiColumnChunk",
        id: 0,
        columns: chunkColumns,
        directions: dirCopy,
        chunkOffset: boundary.offset,
      };
      return {
        request,
        transferables: [...chunkColumns.map((c) => c.buffer), dirCopy.buffer],
      };
    });

    const responses = await this.runChunks<SortMultiColumnChunkRequest, SortMultiColumnChunkResponse>(tasks);

    const sortedChunks: MultiColumnSortedChunk[] = responses.map((response) => ({
      indices: response.indices,
      columns: response.sortedColumns,
      directions: directionArray,
      offset: response.chunkOffset,
    }));
    return kWayMergeMultiColumn(sortedChunks);
  }
}

/**
 * Flatten each chunk's local collision runs into global-offset pairs so
 * the post-merge collision resolver can index into the merged array.
 */
const collectIntraChunkCollisions = (
  responses: SortStringChunkResponse[],
): number[] => {
  const out: number[] = [];
  for (const response of responses) {
    for (let i = 0; i < response.collisionRuns.length; i += 2) {
      out.push(
        response.collisionRuns[i]! + response.chunkOffset,
        response.collisionRuns[i + 1]! + response.chunkOffset,
      );
    }
  }
  return out;
};
