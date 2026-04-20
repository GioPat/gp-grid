// packages/core/src/sorting/string-collision-resolver.ts
// String-hash collision handling for parallel sort. Lives in its own
// module so boundary-collision detection (index-arithmetic heavy) is
// separated from the orchestration logic in ParallelSortManager.

import type { SortedChunk } from "./k-way-merge";

/**
 * After parallel sorting of hash-chunks, identical hashes at chunk
 * boundaries form a single logical collision run. Detect those runs by
 * walking each adjacent pair and measuring how far back into the left
 * chunk (and forward into the right chunk) the identical hash extends.
 *
 * Returns flat pairs: [start1, end1, start2, end2, ...] in the
 * globally-merged index space.
 */
export const detectBoundaryCollisions = (chunks: SortedChunk[]): number[] => {
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

    const lastValue = current.values[current.indices.length - 1];
    const firstValue = next.values[0];

    if (lastValue === firstValue) {
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
        globalPosition + current.indices.length + endInNext + 1,
      );
    }

    globalPosition += current.indices.length;
  }

  return collisions;
};

/**
 * Resolve hash-collision runs in `indices` by re-sorting each run with
 * localeCompare on the original strings. Mutates `indices` in place.
 * Skips runs where every string in the run is already identical — a
 * real collision on the underlying string means localeCompare returns 0
 * and the order is preserved anyway.
 */
export const resolveCollisions = (
  indices: Uint32Array,
  collisionRuns: Uint32Array,
  originalStrings: string[],
  direction: "asc" | "desc",
): void => {
  const mult = direction === "asc" ? 1 : -1;

  for (let r = 0; r < collisionRuns.length; r += 2) {
    const start = collisionRuns[r]!;
    const end = collisionRuns[r + 1]!;
    if (end <= start || end > indices.length) continue;
    resolveRun(indices, start, end, originalStrings, mult);
  }
};

const resolveRun = (
  indices: Uint32Array,
  start: number,
  end: number,
  originalStrings: string[],
  mult: number,
): void => {
  const slice = Array.from(indices.slice(start, end));
  if (isAllIdentical(slice, originalStrings)) return;

  slice.sort((a, b) => mult * originalStrings[a]!.localeCompare(originalStrings[b]!));
  for (let i = 0; i < slice.length; i++) {
    indices[start + i] = slice[i]!;
  }
};

const isAllIdentical = (slice: number[], originalStrings: string[]): boolean => {
  const first = originalStrings[slice[0]!];
  for (let i = 1; i < slice.length; i++) {
    if (originalStrings[slice[i]!] !== first) return false;
  }
  return true;
};
