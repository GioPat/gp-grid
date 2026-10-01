// packages/core/src/column-groups/header-fragments.ts
// Header fragments of a column window (PRD 007 D7): every pin run plus the
// center runs that intersect the mounted range, found by a binary search per
// band, so a window move visits the mounted runs only.

import type { AxisBounds } from "../types/geometry";
import type { HeaderFragment, HeaderFragments } from "../types/column-groups";
import type { HeaderRunSet } from "./header-runs";

const NO_FRAGMENTS: readonly HeaderFragment[] = Object.freeze([]);

/** The fragment lists of a flat grid, shared by every window. */
export const EMPTY_HEADER_FRAGMENTS: HeaderFragments = Object.freeze({
  start: NO_FRAGMENTS,
  center: NO_FRAGMENTS,
  end: NO_FRAGMENTS,
});

/** First run of a band whose leaves reach past `displayIndex`. */
const firstRunEndingAfter = (runs: readonly HeaderFragment[], displayIndex: number): number => {
  let low = 0;
  let high = runs.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const run = runs[middle]!;
    if (run.firstDisplayIndex + run.leafCount > displayIndex) high = middle;
    else low = middle + 1;
  }
  return low;
};

const appendIntersecting = (
  target: HeaderFragment[],
  runs: readonly HeaderFragment[],
  range: AxisBounds,
): void => {
  for (let at = firstRunEndingAfter(runs, range.start); at < runs.length; at++) {
    const run = runs[at]!;
    if (run.firstDisplayIndex >= range.end) return;
    target.push(run);
  }
};

/** Fragments to mount for a center display-index `range`. */
export const selectHeaderFragments = (
  runs: HeaderRunSet | null,
  range: AxisBounds,
): HeaderFragments => {
  if (runs === null || runs.count === 0) return EMPTY_HEADER_FRAGMENTS;
  const center: HeaderFragment[] = [];
  if (range.end > range.start) {
    for (const band of runs.center) appendIntersecting(center, band, range);
  }
  return { start: runs.start, center, end: runs.end };
};
