// packages/core/src/geometry/column-range.ts
// Pure center-column range resolution. The range is the half-open
// center-local index range intersecting the scrolling clip widened by a pixel
// overscan, resolved by binary search over the center prefix sums so raw
// scrolling never rebuilds them.
//
// Width 0 means unmeasured: the range falls back to a fixed pixel extent so
// SSR and the pre-measurement frame stay bounded and non-empty.

import type { AxisBounds, DisplayedColumn } from "../types/geometry";
import { searchOffsets } from "./offsets";

/** Center px admitted before the first real viewport measurement. */
export const UNMEASURED_CENTER_EXTENT = 1920;

const EMPTY_RANGE: AxisBounds = { start: 0, end: 0 };

/**
 * First index whose content right edge exceeds `start`. `offsets[i]` is the
 * left edge of column `i` and `offsets[i + 1]` its right edge, so the last
 * edge at or before `start` is exactly the column containing it; a column
 * whose right edge lands exactly on `start` is excluded.
 */
const rangeStart = (offsets: readonly number[], start: number): number => {
  const candidate = searchOffsets(offsets, start);
  return Math.min(Math.max(candidate, 0), offsets.length - 1);
};

/** Exclusive end index: every column whose left edge precedes `end`. */
const rangeEnd = (offsets: readonly number[], end: number): number => {
  const count = offsets.length - 1;
  if (end >= offsets[count]!) return count;
  if (end <= 0) return 0;
  const candidate = searchOffsets(offsets, end);
  // `searchOffsets` answers the last edge at or before `end`, which owns a
  // column starting exactly there; the range is half-open, so drop it.
  const lower = candidate >= 0 && offsets[candidate] === end ? candidate : candidate + 1;
  return Math.min(Math.max(lower, 0), count);
};

/** Build the prefix edges of the center columns, once per layout. */
export const buildCenterOffsets = (
  columns: readonly DisplayedColumn[],
  centerStart: number,
  centerEnd: number,
): number[] => {
  const offsets = new Array<number>(Math.max(0, centerEnd - centerStart) + 1);
  offsets[0] = 0;
  let running = 0;
  for (let index = centerStart; index < centerEnd; index++) {
    running += columns[index]!.width;
    offsets[index - centerStart + 1] = running;
  }
  return offsets;
};

export interface CenterRangeInput {
  readonly offsets: readonly number[];
  readonly centerTotal: number;
  readonly scrollLeft: number;
  /** Body width left for the center; negative means an unmeasured viewport. */
  readonly centerViewportWidth: number;
  readonly overscan: number;
}

/**
 * Resolve the center-local range for a scroll sample. A negative width means
 * the viewport has not been measured yet; an explicit 0 means the center clip
 * is collapsed, so nothing is mounted.
 */
export const resolveCenterRange = (input: CenterRangeInput): AxisBounds => {
  const { offsets, centerTotal, scrollLeft, centerViewportWidth, overscan } = input;
  const count = offsets.length - 1;
  if (count <= 0) return EMPTY_RANGE;

  const unmeasured = Number.isFinite(centerViewportWidth) === false || centerViewportWidth < 0;
  if (unmeasured === false && centerViewportWidth === 0) return EMPTY_RANGE;

  const extent = unmeasured ? UNMEASURED_CENTER_EXTENT : centerViewportWidth;
  const rawScroll = unmeasured ? 0 : scrollLeft;
  const maxScroll = Math.max(0, centerTotal - extent);
  const scroll = Math.max(0, Math.min(rawScroll, maxScroll));
  const start = Math.max(0, rangeStart(offsets, scroll - overscan));
  const end = Math.max(start, rangeEnd(offsets, scroll + extent + overscan));
  return { start, end };
};
