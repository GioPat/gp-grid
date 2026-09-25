// packages/core/src/managers/page-capacity.ts
// C8 capacity bound: the largest required block union over every reachable
// scroll position. Exact for the uniform (fixed-size) row axis the grid uses
// today; PRD 006 replaces its candidate derivation for variable row sizes.

import type { AxisWindow, VirtualAxis } from "../geometry/virtual-axis";
import { clampCount, normalizePositiveInteger, normalizeSize } from "../utils/number-guards";
import {
  blockCountOf,
  clipHeightOf,
  prefixRangeOf,
  rangeOfWindow,
  unionSize,
  type PageCapacityInput,
} from "./page-blocks";

export interface PageBudget extends Omit<PageCapacityInput, "frozenCount"> {
  readonly maxPages: number;
}

const maxScrollOf = (input: PageCapacityInput): number => {
  const extent = input.axis.extent;
  const fallback = Math.max(0, extent - normalizeSize(input.viewportHeight));
  const value = input.maxScrollTop ?? fallback;
  return Math.min(Math.max(Number.isFinite(value) ? value : fallback, 0), Math.max(0, extent));
};

/** Largest integer in `[low, high]` congruent to `residue`; -1 when absent. */
const largestCongruent = (
  low: number,
  high: number,
  residue: number,
  modulus: number,
): number => {
  const offset = (((high - residue) % modulus) + modulus) % modulus;
  const candidate = high - offset;
  return candidate >= low ? candidate : -1;
};

/** Widest row window whose first row is `rowIndex`: the clip pinned below its next edge. */
const maxSpanWindow = (axis: VirtualAxis, rowIndex: number, clipHeight: number): AxisWindow => {
  const next = axis.getWindow(axis.getOffset(rowIndex + 1), clipHeight);
  return { start: rowIndex, end: Math.max(next.end, rowIndex + 1) };
};

/**
 * Interior first rows that can maximize the union: the range end, the last row
 * whose block still touches the prefix, and the disjoint rows with the lowest
 * and the maximal page residue. Every phase of an interior row is reachable,
 * so each candidate yields its widest window.
 */
const interiorFirstRows = (
  from: number,
  firstRowMax: number,
  prefixEnd: number,
  pageSize: number,
): number[] => {
  const candidates: number[] = [];
  const high = firstRowMax - 1;
  if (high < from) return candidates;
  candidates.push(high);
  const disjointStart = (prefixEnd + 1) * pageSize;
  const abuttingHigh = Math.min(high, disjointStart - 1);
  if (abuttingHigh >= from) candidates.push(abuttingHigh);
  if (disjointStart > high) return candidates;
  candidates.push(disjointStart, largestCongruent(disjointStart, high, pageSize - 1, pageSize));
  return candidates.filter((rowIndex) => rowIndex >= from);
};

/** Uniform (fixed-size) row axis: the candidate enumeration's precondition. */
export const isUniformAxis = (axis: VirtualAxis): boolean => {
  if (axis.count <= 1) return true;
  const size = axis.getSize(0);
  const mid = Math.floor((axis.count - 1) / 2);
  return (
    axis.getSize(axis.count - 1) === size &&
    axis.getSize(mid) === size &&
    axis.getOffset(axis.count) === axis.count * size
  );
};

const assertUniformAxis = (axis: VirtualAxis): void => {
  if (isUniformAxis(axis)) return;
  throw new RangeError("maxRequiredPages requires a uniform row axis; PRD 006 replaces this bound");
};

/** C8 bound: the largest required union over every reachable scroll position, uniform axes only. */
export const maxRequiredPages = (input: PageCapacityInput): number => {
  const axis = input.axis;
  assertUniformAxis(axis);
  const pageSize = normalizePositiveInteger(input.pageSize);
  const frozenCount = clampCount(input.frozenCount, axis.count);
  const prefix = prefixRangeOf(frozenCount, pageSize);
  const clipHeight = clipHeightOf(input, frozenCount);
  if (clipHeight <= 0 || frozenCount >= axis.count) return blockCountOf(prefix);

  const frozenExtent = axis.getOffset(frozenCount);
  const top = axis.getWindow(frozenExtent, clipHeight);
  const bottom = axis.getWindow(frozenExtent + maxScrollOf(input), clipHeight);
  let largest = Math.max(
    unionSize(prefix, rangeOfWindow(top, pageSize)),
    unionSize(prefix, rangeOfWindow(bottom, pageSize)),
  );
  for (const rowIndex of interiorFirstRows(frozenCount, bottom.start, prefix?.end ?? 0, pageSize)) {
    const wide = maxSpanWindow(axis, rowIndex, clipHeight);
    largest = Math.max(largest, unionSize(prefix, rangeOfWindow(wide, pageSize)));
  }
  return largest;
};

/** C2's cache step: `admitsPrefix(count)` is true while the bound fits `maxPages`. */
export const createFrozenPrefixBudget = (
  budget: PageBudget,
): ((frozenCount: number) => boolean) => {
  const maxPages = normalizePositiveInteger(budget.maxPages);
  return (frozenCount) => maxRequiredPages({ ...budget, frozenCount }) <= maxPages;
};
