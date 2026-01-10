// packages/core/src/sorting/parallel-sort-manager.ts
// Orchestrates parallel sorting using worker pool and k-way merge

import type { SortDirection } from '../types';
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
import { kWayMerge, kWayMergeMultiColumn, type SortedChunk, type MultiColumnSortedChunk } from './k-way-merge';

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
  private pool: WorkerPool;
  private parallelThreshold: number;
  private minChunkSize: number;
  private isTerminated = false;

  constructor(options: ParallelSortOptions = {}) {
    const maxWorkers = options.maxWorkers ??
      (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) ?? 4;

    this.pool = new WorkerPool(SORT_WORKER_CODE, { maxWorkers });
    this.parallelThreshold = options.parallelThreshold ?? PARALLEL_THRESHOLD;
    this.minChunkSize = options.minChunkSize ?? MIN_CHUNK_SIZE;
  }

  /**
   * Check if the manager is available for use.
   */
  isAvailable(): boolean {
    return !this.isTerminated && this.pool.isAvailable();
  }

  /**
   * Terminate all workers and clean up resources.
   */
  terminate(): void {
    this.pool.terminate();
    this.isTerminated = true;
  }

  /**
   * Sort indices using values array.
   * Automatically uses parallel sorting for large datasets.
   */
  async sortIndices(
    values: number[],
    direction: SortDirection
  ): Promise<Uint32Array> {
    if (this.isTerminated) {
      throw new Error('ParallelSortManager has been terminated');
    }

    const length = values.length;

    // Use single worker for smaller datasets
    if (length < this.parallelThreshold) {
      return this.sortIndicesSingle(values, direction);
    }

    return this.sortIndicesParallel(values, direction);
  }

  /**
   * Sort string hashes with collision detection.
   * Automatically uses parallel sorting for large datasets.
   */
  async sortStringHashes(
    hashChunks: Float64Array[],
    direction: SortDirection,
    originalStrings: string[]
  ): Promise<Uint32Array> {
    if (this.isTerminated) {
      throw new Error('ParallelSortManager has been terminated');
    }

    const length = hashChunks[0]?.length ?? 0;

    // Use single worker for smaller datasets
    if (length < this.parallelThreshold) {
      return this.sortStringHashesSingle(hashChunks, direction, originalStrings);
    }

    return this.sortStringHashesParallel(hashChunks, direction, originalStrings);
  }

  /**
   * Multi-column sort.
   * Automatically uses parallel sorting for large datasets.
   */
  async sortMultiColumn(
    columns: number[][],
    directions: SortDirection[]
  ): Promise<Uint32Array> {
    if (this.isTerminated) {
      throw new Error('ParallelSortManager has been terminated');
    }

    const length = columns[0]?.length ?? 0;

    // Use single worker for smaller datasets
    if (length < this.parallelThreshold) {
      return this.sortMultiColumnSingle(columns, directions);
    }

    return this.sortMultiColumnParallel(columns, directions);
  }

  // ===========================================================================
  // Single Worker Methods (for smaller datasets)
  // ===========================================================================

  private async sortIndicesSingle(
    values: number[],
    direction: SortDirection
  ): Promise<Uint32Array> {
    const valuesArray = new Float64Array(values);
    const request: SortIndicesRequest = {
      type: 'sortIndices',
      id: 0,
      values: valuesArray,
      direction,
    };

    const response = await this.pool.execute<SortIndicesRequest, SortIndicesResponse>(
      request,
      [valuesArray.buffer]
    );

    return response.indices;
  }

  private async sortStringHashesSingle(
    hashChunks: Float64Array[],
    direction: SortDirection,
    originalStrings: string[]
  ): Promise<Uint32Array> {
    const request: SortStringHashesRequest = {
      type: 'sortStringHashes',
      id: 0,
      hashChunks,
      direction,
    };

    const transferables = hashChunks.map(chunk => chunk.buffer);
    const response = await this.pool.execute<SortStringHashesRequest, SortStringHashesResponse>(
      request,
      transferables
    );

    // Handle collisions on main thread
    if (response.collisionRuns.length > 0) {
      this.resolveCollisions(response.indices, response.collisionRuns, originalStrings, direction);
    }

    return response.indices;
  }

  private async sortMultiColumnSingle(
    columns: number[][],
    directions: SortDirection[]
  ): Promise<Uint32Array> {
    const columnArrays = columns.map(col => new Float64Array(col));
    const directionArray = new Int8Array(directions.map(d => d === 'asc' ? 1 : -1));

    const request: SortMultiColumnRequest = {
      type: 'sortMultiColumn',
      id: 0,
      columns: columnArrays,
      directions: directionArray,
    };

    const transferables = [...columnArrays.map(arr => arr.buffer), directionArray.buffer];
    const response = await this.pool.execute<SortMultiColumnRequest, SortMultiColumnResponse>(
      request,
      transferables
    );

    return response.indices;
  }

  // ===========================================================================
  // Parallel Sorting Methods (for large datasets)
  // ===========================================================================

  private async sortIndicesParallel(
    values: number[],
    direction: SortDirection
  ): Promise<Uint32Array> {
    const chunks = this.splitIntoChunks(values);

    // Create requests for each chunk
    const tasks = chunks.map((chunk) => {
      const valuesArray = new Float64Array(chunk.data);
      const request: SortChunkRequest = {
        type: 'sortChunk',
        id: 0,
        values: valuesArray,
        direction,
        chunkOffset: chunk.offset,
      };
      return { request, transferables: [valuesArray.buffer] };
    });

    // Execute in parallel
    const responses = await this.pool.executeParallel<SortChunkRequest, SortChunkResponse>(tasks);

    // Sort responses by chunkOffset to ensure correct order
    responses.sort((a, b) => a.chunkOffset - b.chunkOffset);

    // Build sorted chunks for k-way merge
    const sortedChunks: SortedChunk[] = responses.map(response => ({
      indices: response.indices,
      values: response.sortedValues,
      offset: response.chunkOffset,
    }));

    // Merge sorted chunks
    return kWayMerge(sortedChunks, direction);
  }

  private async sortStringHashesParallel(
    hashChunks: Float64Array[],
    direction: SortDirection,
    originalStrings: string[]
  ): Promise<Uint32Array> {
    const length = hashChunks[0]!.length;
    const chunkBoundaries = this.calculateChunkBoundaries(length);

    // Create requests for each chunk
    const tasks = chunkBoundaries.map((boundary) => {
      // Extract hash chunks for this data chunk
      const chunkHashChunks = hashChunks.map(hc =>
        new Float64Array(hc.buffer, boundary.offset * 8, boundary.length)
      );

      // We need to copy since we can't slice from the same buffer for transfer
      const copiedChunks = chunkHashChunks.map(hc => {
        const copy = new Float64Array(hc.length);
        copy.set(hc);
        return copy;
      });

      const request: SortStringChunkRequest = {
        type: 'sortStringChunk',
        id: 0,
        hashChunks: copiedChunks,
        direction,
        chunkOffset: boundary.offset,
      };

      const transferables = copiedChunks.map(c => c.buffer);
      return { request, transferables };
    });

    // Execute in parallel
    const responses = await this.pool.executeParallel<SortStringChunkRequest, SortStringChunkResponse>(tasks);

    // Sort responses by chunkOffset
    responses.sort((a, b) => a.chunkOffset - b.chunkOffset);

    // Build sorted chunks for k-way merge
    const sortedChunks: SortedChunk[] = responses.map(response => ({
      indices: response.indices,
      values: response.sortedHashes,
      offset: response.chunkOffset,
    }));

    // Collect all collision runs (adjusting offsets)
    const allCollisionRuns: number[] = [];
    for (const response of responses) {
      for (let i = 0; i < response.collisionRuns.length; i += 2) {
        // Collision runs are local to chunk, need to track for post-merge resolution
        allCollisionRuns.push(
          response.collisionRuns[i]! + response.chunkOffset,
          response.collisionRuns[i + 1]! + response.chunkOffset
        );
      }
    }

    // Merge sorted chunks
    const mergedIndices = kWayMerge(sortedChunks, direction);

    // Detect boundary collisions (where chunks meet)
    const boundaryCollisions = this.detectBoundaryCollisionsForStrings(sortedChunks, direction);

    // Combine all collision runs
    const combinedCollisions = new Uint32Array([...allCollisionRuns, ...boundaryCollisions]);

    // Resolve all collisions
    if (combinedCollisions.length > 0) {
      this.resolveCollisions(mergedIndices, combinedCollisions, originalStrings, direction);
    }

    return mergedIndices;
  }

  private async sortMultiColumnParallel(
    columns: number[][],
    directions: SortDirection[]
  ): Promise<Uint32Array> {
    const length = columns[0]!.length;
    const chunkBoundaries = this.calculateChunkBoundaries(length);
    const directionArray = new Int8Array(directions.map(d => d === 'asc' ? 1 : -1));

    // Create requests for each chunk
    const tasks = chunkBoundaries.map((boundary) => {
      // Extract columns for this chunk
      const chunkColumns = columns.map(col => {
        const chunk = new Float64Array(boundary.length);
        for (let i = 0; i < boundary.length; i++) {
          chunk[i] = col[boundary.offset + i]!;
        }
        return chunk;
      });

      // Copy direction array for each request
      const dirCopy = new Int8Array(directionArray);

      const request: SortMultiColumnChunkRequest = {
        type: 'sortMultiColumnChunk',
        id: 0,
        columns: chunkColumns,
        directions: dirCopy,
        chunkOffset: boundary.offset,
      };

      const transferables = [...chunkColumns.map(c => c.buffer), dirCopy.buffer];
      return { request, transferables };
    });

    // Execute in parallel
    const responses = await this.pool.executeParallel<SortMultiColumnChunkRequest, SortMultiColumnChunkResponse>(tasks);

    // Sort responses by chunkOffset
    responses.sort((a, b) => a.chunkOffset - b.chunkOffset);

    // Build sorted chunks for k-way merge
    const sortedChunks: MultiColumnSortedChunk[] = responses.map(response => ({
      indices: response.indices,
      columns: response.sortedColumns,
      directions: directionArray,
      offset: response.chunkOffset,
    }));

    // Merge sorted chunks
    return kWayMergeMultiColumn(sortedChunks);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Split data into chunks for parallel processing.
   */
  private splitIntoChunks<T>(data: T[]): Array<{ data: T[]; offset: number }> {
    const length = data.length;
    const maxWorkers = this.pool.getMaxWorkers();
    const chunkSize = Math.max(this.minChunkSize, Math.ceil(length / maxWorkers));
    const chunks: Array<{ data: T[]; offset: number }> = [];

    for (let offset = 0; offset < length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, length);
      chunks.push({
        data: data.slice(offset, end),
        offset,
      });
    }

    return chunks;
  }

  /**
   * Calculate chunk boundaries without copying data.
   */
  private calculateChunkBoundaries(length: number): Array<{ offset: number; length: number }> {
    const maxWorkers = this.pool.getMaxWorkers();
    const chunkSize = Math.max(this.minChunkSize, Math.ceil(length / maxWorkers));
    const boundaries: Array<{ offset: number; length: number }> = [];

    for (let offset = 0; offset < length; offset += chunkSize) {
      boundaries.push({
        offset,
        length: Math.min(chunkSize, length - offset),
      });
    }

    return boundaries;
  }

  /**
   * Detect collisions at chunk boundaries for string sorting.
   */
  private detectBoundaryCollisionsForStrings(
    chunks: SortedChunk[],
    _direction: SortDirection
  ): number[] {
    if (chunks.length <= 1) return [];

    const collisions: number[] = [];
    let globalPosition = 0;

    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i]!;
      const next = chunks[i + 1]!;

      if (current.indices.length === 0 || next.indices.length === 0) {
        globalPosition += current.indices.length;
        continue;
      }

      // Compare last value of current chunk with first value of next
      const lastValue = current.values[current.indices.length - 1];
      const firstValue = next.values[0];

      if (lastValue === firstValue) {
        // Find extent of collision run
        let startInCurrent = current.indices.length - 1;
        while (startInCurrent > 0 && current.values[startInCurrent - 1] === lastValue) {
          startInCurrent--;
        }

        let endInNext = 0;
        while (endInNext < next.indices.length - 1 && next.values[endInNext + 1] === firstValue) {
          endInNext++;
        }

        collisions.push(
          globalPosition + startInCurrent,
          globalPosition + current.indices.length + endInNext + 1
        );
      }

      globalPosition += current.indices.length;
    }

    return collisions;
  }

  /**
   * Resolve hash collisions using localeCompare.
   */
  private resolveCollisions(
    indices: Uint32Array,
    collisionRuns: Uint32Array,
    originalStrings: string[],
    direction: SortDirection
  ): void {
    const mult = direction === 'asc' ? 1 : -1;

    for (let r = 0; r < collisionRuns.length; r += 2) {
      const start = collisionRuns[r]!;
      const end = collisionRuns[r + 1]!;

      if (end <= start || end > indices.length) continue;

      const slice = Array.from(indices.slice(start, end));

      // Check if all strings are identical (optimization)
      const firstString = originalStrings[slice[0]!];
      let allIdentical = true;
      for (let i = 1; i < slice.length; i++) {
        if (originalStrings[slice[i]!] !== firstString) {
          allIdentical = false;
          break;
        }
      }

      if (allIdentical) continue;

      // Sort by original strings
      slice.sort((a, b) => mult * originalStrings[a]!.localeCompare(originalStrings[b]!));

      // Write back
      for (let i = 0; i < slice.length; i++) {
        indices[start + i] = slice[i]!;
      }
    }
  }
}
