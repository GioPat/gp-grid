// packages/core/src/geometry/prefix-axis.ts

import { buildOffsets, searchOffsets, assertSafeIndex, clampIndex } from "./offsets";
import { windowOf, type AxisWindow, type VirtualAxis } from "./virtual-axis";

/** Axis over stored cumulative offsets, resolved by binary search. */
export const createPrefixAxis = (sizes: readonly number[]): VirtualAxis => {
  const snapshot = Array.from(sizes);
  const offsets = buildOffsets(snapshot);
  const count = snapshot.length;
  const extent = offsets[count]!;

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
