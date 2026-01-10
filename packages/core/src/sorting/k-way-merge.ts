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

/**
 * Entry in the min/max heap for k-way merge.
 */
interface HeapEntry {
  /** Which chunk this entry came from */
  chunkIndex: number;
  /** Current position within the chunk */
  positionInChunk: number;
  /** Value for comparison */
  value: number;
  /** Original global index */
  globalIndex: number;
}

/**
 * Entry for multi-column heap.
 */
interface MultiColumnHeapEntry {
  chunkIndex: number;
  positionInChunk: number;
  values: number[];
  globalIndex: number;
}

// =============================================================================
// Min Heap Implementation
// =============================================================================

/**
 * Binary min-heap for k-way merge.
 * Time complexity: O(log k) for push/pop where k is heap size.
 */
class MinHeap {
  private heap: HeapEntry[] = [];
  private multiplier: number;

  constructor(direction: SortDirection) {
    // For ascending, smaller values have priority (multiplier = 1)
    // For descending, larger values have priority (multiplier = -1)
    this.multiplier = direction === 'asc' ? 1 : -1;
  }

  push(entry: HeapEntry): void {
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): HeapEntry | undefined {
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

  private compare(a: HeapEntry, b: HeapEntry): number {
    return (a.value - b.value) * this.multiplier;
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = temp;
  }
}

/**
 * Binary heap for multi-column k-way merge.
 */
class MultiColumnMinHeap {
  private heap: MultiColumnHeapEntry[] = [];
  private directions: Int8Array;

  constructor(directions: Int8Array) {
    this.directions = directions;
  }

  push(entry: MultiColumnHeapEntry): void {
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): MultiColumnHeapEntry | undefined {
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

  private compare(a: MultiColumnHeapEntry, b: MultiColumnHeapEntry): number {
    for (let i = 0; i < this.directions.length; i++) {
      const diff = (a.values[i]! - b.values[i]!) * this.directions[i]!;
      if (diff !== 0) return diff;
    }
    return 0;
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = temp;
  }
}

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
    // Single chunk - just adjust indices to global
    const chunk = chunks[0]!;
    const result = new Uint32Array(chunk.indices.length);
    for (let i = 0; i < chunk.indices.length; i++) {
      result[i] = chunk.indices[i]! + chunk.offset;
    }
    return result;
  }

  // Calculate total length
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.indices.length;
  }

  const result = new Uint32Array(totalLength);
  const heap = new MinHeap(direction);

  // Initialize heap with first element from each non-empty chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (chunk.indices.length > 0) {
      const localIndex = chunk.indices[0]!;
      heap.push({
        chunkIndex: i,
        positionInChunk: 0,
        value: chunk.values[0]!,
        globalIndex: localIndex + chunk.offset,
      });
    }
  }

  // Merge
  let resultIndex = 0;
  while (heap.size() > 0) {
    const entry = heap.pop()!;
    result[resultIndex++] = entry.globalIndex;

    // Push next element from the same chunk
    const chunk = chunks[entry.chunkIndex]!;
    const nextPosition = entry.positionInChunk + 1;

    if (nextPosition < chunk.indices.length) {
      const localIndex = chunk.indices[nextPosition]!;
      heap.push({
        chunkIndex: entry.chunkIndex,
        positionInChunk: nextPosition,
        value: chunk.values[nextPosition]!,
        globalIndex: localIndex + chunk.offset,
      });
    }
  }

  return result;
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
    const chunk = chunks[0]!;
    const result = new Uint32Array(chunk.indices.length);
    for (let i = 0; i < chunk.indices.length; i++) {
      result[i] = chunk.indices[i]! + chunk.offset;
    }
    return result;
  }

  // Use directions from first chunk (all chunks have same directions)
  const directions = chunks[0]!.directions;
  const numColumns = directions.length;

  // Calculate total length
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.indices.length;
  }

  const result = new Uint32Array(totalLength);
  const heap = new MultiColumnMinHeap(directions);

  // Initialize heap with first element from each non-empty chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (chunk.indices.length > 0) {
      const localIndex = chunk.indices[0]!;
      const values: number[] = [];
      for (let c = 0; c < numColumns; c++) {
        values.push(chunk.columns[c]![0]!);
      }

      heap.push({
        chunkIndex: i,
        positionInChunk: 0,
        values,
        globalIndex: localIndex + chunk.offset,
      });
    }
  }

  // Merge
  let resultIndex = 0;
  while (heap.size() > 0) {
    const entry = heap.pop()!;
    result[resultIndex++] = entry.globalIndex;

    const chunk = chunks[entry.chunkIndex]!;
    const nextPosition = entry.positionInChunk + 1;

    if (nextPosition < chunk.indices.length) {
      const localIndex = chunk.indices[nextPosition]!;
      const values: number[] = [];
      for (let c = 0; c < numColumns; c++) {
        values.push(chunk.columns[c]![nextPosition]!);
      }

      heap.push({
        chunkIndex: entry.chunkIndex,
        positionInChunk: nextPosition,
        values,
        globalIndex: localIndex + chunk.offset,
      });
    }
  }

  return result;
}

/**
 * Detect collision runs at chunk boundaries after merge.
 * This is used for string sorting where hashes may collide across chunks.
 *
 * @param chunks - Original sorted chunks with their hash values
 * @param _direction - Sort direction
 * @returns Array of boundary collision positions [start1, end1, start2, end2, ...]
 */
export function detectBoundaryCollisions(
  chunks: SortedChunk[],
  _direction: SortDirection
): Uint32Array {
  if (chunks.length <= 1) {
    return new Uint32Array(0);
  }

  const collisions: number[] = [];
  let globalPosition = 0;

  for (let i = 0; i < chunks.length - 1; i++) {
    const currentChunk = chunks[i]!;
    const nextChunk = chunks[i + 1]!;

    if (currentChunk.indices.length === 0 || nextChunk.indices.length === 0) {
      globalPosition += currentChunk.indices.length;
      continue;
    }

    // Get last value of current chunk and first value of next chunk
    const lastPos = currentChunk.indices.length - 1;
    const lastValue = currentChunk.values[lastPos];
    const firstValue = nextChunk.values[0];

    // If they're equal (or very close for floating point), it's a boundary collision
    if (lastValue === firstValue) {
      // Find the extent of the collision run
      // Look backwards in current chunk
      let startInCurrent = lastPos;
      while (startInCurrent > 0 && currentChunk.values[startInCurrent - 1] === lastValue) {
        startInCurrent--;
      }

      // Look forwards in next chunk
      let endInNext = 0;
      while (endInNext < nextChunk.indices.length - 1 && nextChunk.values[endInNext + 1] === firstValue) {
        endInNext++;
      }

      // Record the collision run (global positions)
      const collisionStart = globalPosition + startInCurrent;
      const collisionEnd = globalPosition + currentChunk.indices.length + endInNext + 1;
      collisions.push(collisionStart, collisionEnd);
    }

    globalPosition += currentChunk.indices.length;
  }

  return new Uint32Array(collisions);
}
