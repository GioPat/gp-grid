// packages/core/src/sorting/k-way-merge.ts
// K-way merge algorithm for combining sorted chunks

import type { SortDirection } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a sorted chunk with its values and offset in the original array.
 */
export interface SortedChunk {
  /** Sorted indices (local to this chunk) */
  indices: Uint32Array;
  /** Values for comparison (in same order as indices) */
  values: Float64Array;
  /** Offset of this chunk in the original array */
  offset: number;
}

/**
 * Represents a sorted chunk for multi-column sorting.
 */
export interface MultiColumnSortedChunk {
  /** Sorted indices (local to this chunk) */
  indices: Uint32Array;
  /** Values for comparison - array of columns, each in same order as indices */
  columns: Float64Array[];
  /** Sort directions for each column (1 = asc, -1 = desc) */
  directions: Int8Array;
  /** Offset of this chunk in the original array */
  offset: number;
}

/** The minimum a chunk must expose for the merge driver to walk it. */
interface MergeableChunk {
  indices: Uint32Array;
  offset: number;
}

/**
 * Entry in the min/max heap for k-way merge. The payload is whatever the
 * caller compares on: a single value, or one value per sort column.
 */
interface HeapEntry<TPayload> {
  /** Which chunk this entry came from */
  chunkIndex: number;
  /** Current position within the chunk */
  positionInChunk: number;
  /** Value(s) for comparison */
  payload: TPayload;
  /** Original global index */
  globalIndex: number;
}

// =============================================================================
// Binary Heap Implementation
// =============================================================================

/**
 * Generic binary min-heap.
 * Time complexity: O(log k) for push/pop where k is heap size.
 */
class BinaryHeap<T> {
  private heap: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  push(entry: T): void {
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;

    const result = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return result;
  }

  size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index]!, this.heap[parentIndex]!) >= 0) {
        break;
      }
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.compare(this.heap[leftChild]!, this.heap[smallest]!) < 0) {
        smallest = leftChild;
      }
      if (rightChild < length && this.compare(this.heap[rightChild]!, this.heap[smallest]!) < 0) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = temp;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract the comparison values for all sort columns at a given position in a chunk.
 */
const getColumnValuesAt = (
  chunk: MultiColumnSortedChunk,
  position: number,
  numColumns: number,
): number[] => {
  const values: number[] = [];
  for (let c = 0; c < numColumns; c++) {
    values.push(chunk.columns[c]![position]!);
  }
  return values;
};

/** Rebase a lone chunk's local indices onto the global array. */
const mergeSingleChunk = (chunk: MergeableChunk): Uint32Array => {
  const result = new Uint32Array(chunk.indices.length);
  for (let i = 0; i < chunk.indices.length; i++) {
    result[i] = chunk.indices[i]! + chunk.offset;
  }
  return result;
};

const totalIndexCount = (chunks: readonly MergeableChunk[]): number => {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.indices.length;
  }
  return total;
};

/**
 * Heap-driven k-way merge, shared by the single- and multi-column entry points.
 * The caller supplies how to read a comparison payload out of a chunk and how
 * to order two payloads; heap seeding, draining and rebasing local indices onto
 * the global array are identical between them.
 *
 * Ties always break on the original global index so that rows with equal sort
 * keys keep their input order (stable sort), matching the synchronous applySort.
 */
const mergeChunks = <TChunk extends MergeableChunk, TPayload>(
  chunks: TChunk[],
  readPayload: (chunk: TChunk, position: number) => TPayload,
  comparePayloads: (a: TPayload, b: TPayload) => number,
): Uint32Array => {
  const result = new Uint32Array(totalIndexCount(chunks));
  const heap = new BinaryHeap<HeapEntry<TPayload>>((a, b) => {
    const diff = comparePayloads(a.payload, b.payload);
    if (diff !== 0) return diff;
    return a.globalIndex - b.globalIndex;
  });

  const pushPosition = (chunkIndex: number, positionInChunk: number): void => {
    const chunk = chunks[chunkIndex]!;
    heap.push({
      chunkIndex,
      positionInChunk,
      payload: readPayload(chunk, positionInChunk),
      globalIndex: chunk.indices[positionInChunk]! + chunk.offset,
    });
  };

  // Seed the heap with the first element of each non-empty chunk
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i]!.indices.length > 0) {
      pushPosition(i, 0);
    }
  }

  let resultIndex = 0;
  while (heap.size() > 0) {
    const entry = heap.pop()!;
    result[resultIndex++] = entry.globalIndex;

    const nextPosition = entry.positionInChunk + 1;
    if (nextPosition < chunks[entry.chunkIndex]!.indices.length) {
      pushPosition(entry.chunkIndex, nextPosition);
    }
  }

  return result;
};

// =============================================================================
// K-Way Merge Functions
// =============================================================================

/**
 * Merge multiple sorted chunks into a single sorted result.
 * Uses a min-heap for O(n log k) time complexity.
 *
 * @param chunks - Array of sorted chunks to merge
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns Uint32Array of globally sorted indices
 */
export function kWayMerge(
  chunks: SortedChunk[],
  direction: SortDirection
): Uint32Array {
  if (chunks.length === 0) {
    return new Uint32Array(0);
  }

  if (chunks.length === 1) {
    return mergeSingleChunk(chunks[0]!);
  }

  const multiplier = direction === 'asc' ? 1 : -1;

  return mergeChunks(
    chunks,
    (chunk, position) => chunk.values[position]!,
    (a, b) => (a - b) * multiplier,
  );
}

/**
 * Merge multiple sorted chunks for multi-column sorting.
 *
 * @param chunks - Array of multi-column sorted chunks
 * @returns Uint32Array of globally sorted indices
 */
export function kWayMergeMultiColumn(
  chunks: MultiColumnSortedChunk[]
): Uint32Array {
  if (chunks.length === 0) {
    return new Uint32Array(0);
  }

  if (chunks.length === 1) {
    return mergeSingleChunk(chunks[0]!);
  }

  // Use directions from first chunk (all chunks have same directions)
  const directions = chunks[0]!.directions;
  const numColumns = directions.length;

  return mergeChunks(
    chunks,
    (chunk, position) => getColumnValuesAt(chunk, position, numColumns),
    (a, b) => {
      for (let i = 0; i < numColumns; i++) {
        const diff = (a[i]! - b[i]!) * directions[i]!;
        if (diff !== 0) return diff;
      }
      return 0;
    },
  );
}
