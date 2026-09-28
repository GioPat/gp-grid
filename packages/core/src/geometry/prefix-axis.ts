// packages/core/src/geometry/prefix-axis.ts

import { buildOffsets, searchOffsets, assertSafeIndex, clampIndex } from "./offsets";
import { windowOf, type AxisWindow, type VirtualAxis } from "./virtual-axis";

interface SizeRange {
  readonly minSize: number;
  readonly uniformSize?: number;
}

/** One pass over the sizes: the lower bound, and the shared size when there is one. */
const sizeRangeOf = (sizes: readonly number[]): SizeRange => {
  const first = sizes[0];
  if (first === undefined) return { minSize: 0 };
  let minSize = first;
  let uniform = true;
  for (const size of sizes) {
    if (size < minSize) minSize = size;
    if (size !== first) uniform = false;
  }
  return { minSize, uniformSize: uniform ? first : undefined };
};

/** Axis over stored cumulative offsets, resolved by binary search. */
export const createPrefixAxis = (sizes: readonly number[]): VirtualAxis => {
  const snapshot = Array.from(sizes);
  const offsets = buildOffsets(snapshot);
  const count = snapshot.length;
  const extent = offsets[count]!;
  const range = sizeRangeOf(snapshot);

  const getOffset = (index: number): number => {
    assertSafeIndex(index, "index");
    return offsets[Math.min(Math.max(index, 0), count)]!;
  };

  const indexAt = (offset: number): number => {
    if (Number.isNaN(offset) || offset < 0) {
      return -1;
    }
    if (offset >= extent) {
      return count;
    }
    return clampIndex(searchOffsets(offsets, offset), count);
  };

  const axis = {
    count,
    extent,
    uniformSize: range.uniformSize,
    minSize: range.minSize,
    getSize: (index: number): number => {
      assertSafeIndex(index, "index");
      return index >= 0 && index < count ? snapshot[index]! : 0;
    },
    getOffset,
    indexAt,
    getWindow: (offset: number, viewportExtent: number, overscan = 0): AxisWindow =>
      windowOf(axis, offset, viewportExtent, overscan),
  };
  return axis;
};
