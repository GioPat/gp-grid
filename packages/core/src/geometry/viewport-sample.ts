// packages/core/src/geometry/viewport-sample.ts
// The numeric viewport sample geometry reads: normalized dimensions, and
// scroll offsets clamped into the range the DOM scroller can reach.

import type { RowScrollMapping } from "./row-geometry";
import type { VirtualAxis } from "./virtual-axis";

export interface GridViewportSample {
  /** Body content-area dimensions: height excludes the header. */
  readonly width: number;
  readonly height: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

/** Non-finite or non-positive measurements normalize to 0 (A5, A9). */
const normalizeMeasurement = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

const normalizeOffset = (value: number): number => (Number.isFinite(value) ? value : 0);

export const normalizeSample = (sample: GridViewportSample): GridViewportSample => ({
  width: normalizeMeasurement(sample.width),
  height: normalizeMeasurement(sample.height),
  scrollLeft: normalizeOffset(sample.scrollLeft),
  scrollTop: normalizeOffset(sample.scrollTop),
});

/** Clamp a scroll offset into `[0, max]`, preserving fractions. */
export const clampScroll = (offset: number, max: number): number =>
  Math.min(Math.max(normalizeOffset(offset), 0), Math.max(max, 0));

/**
 * End of the DOM scroll range. It only moves with the row axis or the viewport
 * height, and rows read it per slot, so it is recomputed on those changes only.
 */
export const createMaxScrollTop = (
  getAxis: () => VirtualAxis,
  getMapping: () => RowScrollMapping,
): ((viewportHeight: number) => number) => {
  let memo: { axis: VirtualAxis; height: number; value: number } | null = null;
  return (viewportHeight) => {
    const axis = getAxis();
    if (memo?.axis !== axis || memo.height !== viewportHeight) {
      const mapping = getMapping();
      const value = mapping.toDomScrollTop(mapping.getMaxLogicalScrollTop());
      memo = { axis, height: viewportHeight, value };
    }
    return memo.value;
  };
};
