// packages/core/src/sorting/chunk-splitter.ts
// Compute chunk boundaries for parallel sorting. Kept separate so the
// chunk-size rule lives in one place — all three parallel sort variants
// share it.

export interface ChunkBoundary {
  /** Offset of this chunk within the original array */
  offset: number;
  /** Length of this chunk */
  length: number;
}

/**
 * Split `length` into chunks sized by worker count with a minimum floor
 * to avoid paying worker-setup overhead on tiny chunks.
 */
export const calculateChunkBoundaries = (
  length: number,
  maxWorkers: number,
  minChunkSize: number,
): ChunkBoundary[] => {
  const chunkSize = Math.max(minChunkSize, Math.ceil(length / maxWorkers));
  const boundaries: ChunkBoundary[] = [];
  for (let offset = 0; offset < length; offset += chunkSize) {
    boundaries.push({
      offset,
      length: Math.min(chunkSize, length - offset),
    });
  }
  return boundaries;
};
