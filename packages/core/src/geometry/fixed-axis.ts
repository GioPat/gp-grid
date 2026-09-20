// packages/core/src/geometry/fixed-axis.ts

import { assertCount, assertPositiveFinite, assertSafeIndex, clampIndex } from "./offsets";
import { windowOf, type AxisWindow, type VirtualAxis } from "./virtual-axis";

const getSize = (index: number, count: number, size: number): number => {
  assertSafeIndex(index, "index");
  return index >= 0 && index < count ? size : 0;
};

/**
 * Fixed-size axis with O(1) storage and lookups. Estimated indices are
 * corrected against the authoritative offset so fractional edges and counts
 * beyond float64's exact `i * size` range stay consistent.
 */
export const createFixedAxis = (count: number, size: number): VirtualAxis => {
  assertCount(count, "count");
  assertPositiveFinite(size, "size");
  const extent = count * size;
  if (!Number.isFinite(extent)) {
    throw new RangeError(`Invalid total extent: ${extent}`);
  }

  const axis = {
    count,
    extent,
    getSize: (index: number): number => getSize(index, count, size),
    getOffset: (index: number): number => {
      assertSafeIndex(index, "index");
      return Math.min(Math.max(index, 0), count) * size;
    },
    indexAt: (offset: number): number => {
      if (Number.isNaN(offset) || offset < 0) {
        return -1;
      }
      if (offset >= extent) {
        return count;
      }
      let index = clampIndex(Math.floor(offset / size), count);
      // Bounded walk: past `Number.MAX_SAFE_INTEGER` the `i * size` table is no
      // longer injective, so an unbounded correction would not terminate.
      for (let step = 0; step < 4; step++) {
        if (index > 0 && axis.getOffset(index) > offset) {
          index -= 1;
          continue;
        }
        if (index < count && axis.getOffset(index + 1) <= offset) {
          index += 1;
          continue;
        }
        break;
      }
      return index;
    },
    getWindow: (offset: number, viewportExtent: number, overscan = 0): AxisWindow =>
      windowOf(axis, offset, viewportExtent, overscan),
  };
  return axis;
};
