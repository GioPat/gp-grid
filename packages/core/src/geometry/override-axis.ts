// packages/core/src/geometry/override-axis.ts
// Row axis over application-set sizes: runs of default-size rows between the
// placed ones. Built from `placed` alone, so its cost is O(K) in the number of
// overrides and never in the row count.

import { assertCount, assertPositiveFinite, assertSafeIndex, clampIndex } from "./offsets";
import { windowOf, type AxisWindow, type VirtualAxis } from "./virtual-axis";

/** An application-set size at a view index; `size` differs from the default. */
export interface PlacedRowSize {
  readonly index: number;
  readonly size: number;
}

const assertPlaced = (placed: readonly PlacedRowSize[], count: number): void => {
  let previous = -1;
  for (const entry of placed) {
    if (Number.isSafeInteger(entry.index) === false || entry.index < 0 || entry.index >= count) {
      throw new RangeError(`Invalid row height index: ${entry.index}`);
    }
    if (entry.index <= previous) {
      throw new RangeError(`Row height indices must be ascending and unique: ${entry.index}`);
    }
    assertPositiveFinite(entry.size, `row height for row index ${entry.index}`);
    previous = entry.index;
  }
};

/** Placed entries strictly before `index`. */
const runOf = (indices: Float64Array, k: number, index: number): number => {
  let low = 0;
  let high = k;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (indices[mid]! < index) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

/**
 * Run containing `offset`, plus the first and last index it spans. Run `j`
 * holds the default rows after placed entry `j − 1` and ends with placed entry
 * `j`; it is the last run whose first row starts at or before the offset.
 */
const locateRun = (
  indices: Float64Array,
  runs: Float64Array,
  defaultSize: number,
  count: number,
  offset: number,
): { run: number; first: number; last: number } => {
  let low = 0;
  let high = indices.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((indices[mid - 1]! + 1) * defaultSize + runs[mid]! <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const run = low;
  const first = run === 0 ? 0 : indices[run - 1]! + 1;
  const last = run === indices.length ? count - 1 : indices[run]!;
  return { run, first, last };
};

export const createOverrideAxis = (
  count: number,
  defaultSize: number,
  placed: readonly PlacedRowSize[],
): VirtualAxis => {
  assertCount(count, "count");
  assertPositiveFinite(defaultSize, "size");
  assertPlaced(placed, count);

  const k = placed.length;
  const indices = new Float64Array(k);
  const sizes = new Float64Array(k);
  // Cumulative displaced size per run: `runs[j]` is the sum of the first `j`
  // placed deltas, so `offset(i) = i × defaultSize + runs[runOf(i)]`.
  const runs = new Float64Array(k + 1);
  let running = 0;
  let minSize = defaultSize;
  for (let j = 0; j < k; j++) {
    const entry = placed[j]!;
    indices[j] = entry.index;
    sizes[j] = entry.size;
    running += entry.size - defaultSize;
    runs[j + 1] = running;
    if (entry.size < minSize) minSize = entry.size;
  }

  const extent = count * defaultSize + running;
  if (!Number.isFinite(extent) || (k > 0 && extent <= 0)) {
    throw new RangeError(`Invalid total extent: ${extent}`);
  }

  /** Placed entry at `index`, or -1. */
  const placedAt = (index: number): number => {
    const run = runOf(indices, k, index);
    return run < k && indices[run] === index ? run : -1;
  };

  const getOffset = (index: number): number => {
    assertSafeIndex(index, "index");
    const bounded = Math.min(Math.max(index, 0), count);
    return bounded * defaultSize + runs[runOf(indices, k, bounded)]!;
  };

  const getSize = (index: number): number => {
    assertSafeIndex(index, "index");
    if (index < 0 || index >= count) return 0;
    const run = placedAt(index);
    return run === -1 ? defaultSize : sizes[run]!;
  };

  const indexAt = (offset: number): number => {
    if (Number.isNaN(offset) || offset < 0) {
      return -1;
    }
    if (offset >= extent) {
      return count;
    }
    const span = locateRun(indices, runs, defaultSize, count, offset);
    // Rows in a run are `defaultSize` apart up to its placed last row, so the
    // clamped division lands on the answer; the walk only absorbs float edges.
    const estimated = Math.floor((offset - runs[span.run]!) / defaultSize);
    let index = clampIndex(Math.min(Math.max(estimated, span.first), span.last), count);
    // Bounded walk: fractional sizes can leave an estimated run a row short,
    // and an unbounded correction would not terminate past float64's exact range.
    for (let step = 0; step < 4; step++) {
      if (index > 0 && getOffset(index) > offset) {
        index -= 1;
        continue;
      }
      if (index < count && getOffset(index + 1) <= offset) {
        index += 1;
        continue;
      }
      break;
    }
    return index;
  };

  const axis = {
    count,
    extent,
    // Every placed size differs from the default, so the axis is never uniform.
    minSize,
    getSize,
    getOffset,
    indexAt,
    getWindow: (offset: number, viewportExtent: number, overscan = 0): AxisWindow =>
      windowOf(axis, offset, viewportExtent, overscan),
  };
  return axis;
};
