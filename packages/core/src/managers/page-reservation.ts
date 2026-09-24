// packages/core/src/managers/page-reservation.ts
// C8 page rules: the required prefix/suffix block union at a scroll position,
// the capacity bound over every reachable position, optional-page admission,
// prefix reservations and eviction ordering. The bound is exact for the
// uniform (fixed-size) row axis the grid uses today; PRD 006 replaces its
// candidate derivation for variable row sizes.

import type { AxisWindow, VirtualAxis } from "../geometry/virtual-axis";

/** Half-open block-index range. */
export interface BlockRange {
  readonly start: number;
  readonly end: number;
}

export interface PageCapacityInput {
  axis: VirtualAxis;
  pageSize: number;
  viewportHeight: number;
  frozenCount: number;
  /** Reachable logical scroll top; `max(0, extent − viewportHeight)` by default. */
  maxScrollTop?: number;
}

export interface PagePositionInput extends PageCapacityInput {
  /** Logical (content) scroll top the position is measured at. */
  scrollTop: number;
}

export interface RequiredPageRanges {
  readonly prefix: BlockRange | null;
  readonly suffix: BlockRange | null;
  /** Blocks strictly between the two regions; optional admission never fills them. */
  readonly gap: BlockRange | null;
}

export interface PageBudget extends Omit<PageCapacityInput, "frozenCount"> {
  readonly maxPages: number;
}

export interface OptionalPageAdmission {
  required: readonly number[];
  loaded: readonly number[];
  reserved: readonly number[];
  maxPages: number;
  overscan?: readonly number[];
  prefetch?: readonly number[];
  gap?: BlockRange | null;
}

export interface PrefixReservation {
  readonly pages: readonly number[];
  readonly released: readonly number[];
}

const normalizePositiveInteger = (value: number): number =>
  Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;

const normalizeHeight = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

const clampCount = (value: number, count: number): number => {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(integer, 0), count);
};

const prefixRangeOf = (frozenCount: number, pageSize: number): BlockRange | null =>
  frozenCount > 0
    ? { start: 0, end: Math.floor((frozenCount - 1) / pageSize) + 1 }
    : null;

const rangeOfWindow = (axisWindow: AxisWindow, pageSize: number): BlockRange | null =>
  axisWindow.end > axisWindow.start
    ? {
      start: Math.floor(axisWindow.start / pageSize),
      end: Math.floor((axisWindow.end - 1) / pageSize) + 1,
    }
    : null;

const blockCountOf = (range: BlockRange | null): number =>
  range === null ? 0 : range.end - range.start;

/** Every block index in a range, ascending. */
const blocksOfRange = (range: BlockRange | null): number[] =>
  Array.from({ length: blockCountOf(range) }, (_, index) => (range?.start ?? 0) + index);

/** Every block index intersecting a half-open row window. */
export const getWindowPageBlocks = (window: AxisWindow, pageSize: number): number[] =>
  blocksOfRange(rangeOfWindow(window, normalizePositiveInteger(pageSize)));

/** Union size of two ranges; touching ranges merge, a real gap keeps them apart. */
const unionSize = (a: BlockRange | null, b: BlockRange | null): number => {
  if (a === null) return blockCountOf(b);
  if (b === null) return blockCountOf(a);
  const apart = b.start > a.end || a.start > b.end;
  if (apart) return blockCountOf(a) + blockCountOf(b);
  return Math.max(a.end, b.end) - Math.min(a.start, b.start);
};

const gapOf = (prefix: BlockRange | null, suffix: BlockRange | null): BlockRange | null => {
  if (prefix === null || suffix === null) return null;
  return suffix.start > prefix.end ? { start: prefix.end, end: suffix.start } : null;
};

const clipHeightOf = (input: PageCapacityInput, frozenCount: number): number =>
  Math.max(0, normalizeHeight(input.viewportHeight) - input.axis.getOffset(frozenCount));

const maxScrollOf = (input: PageCapacityInput): number => {
  const extent = input.axis.extent;
  const fallback = Math.max(0, extent - normalizeHeight(input.viewportHeight));
  const value = input.maxScrollTop ?? fallback;
  return Math.min(Math.max(Number.isFinite(value) ? value : fallback, 0), Math.max(0, extent));
};

export const getRequiredPageRanges = (input: PagePositionInput): RequiredPageRanges => {
  const axis = input.axis;
  const pageSize = normalizePositiveInteger(input.pageSize);
  const frozenCount = clampCount(input.frozenCount, axis.count);
  const frozenExtent = axis.getOffset(frozenCount);
  const scrollTop = Number.isFinite(input.scrollTop) ? Math.max(input.scrollTop, 0) : 0;
  const axisWindow = axis.getWindow(scrollTop + frozenExtent, clipHeightOf(input, frozenCount));
  const prefix = prefixRangeOf(frozenCount, pageSize);
  const suffix = rangeOfWindow(axisWindow, pageSize);
  return { prefix, suffix, gap: gapOf(prefix, suffix) };
};

/** Deduplicated, ascending required blocks: the prefix range plus every suffix block. */
export const getRequiredPageBlocks = (input: PagePositionInput): number[] => {
  const { prefix, suffix } = getRequiredPageRanges(input);
  const blocks = new Set([...blocksOfRange(prefix), ...blocksOfRange(suffix)]);
  return [...blocks].sort((a, b) => a - b);
};

/** Largest integer in `[low, high]` congruent to `residue`; -1 when absent. */
const largestCongruent = (
  low: number,
  high: number,
  residue: number,
  modulus: number,
): number => {
  if (high < low) return -1;
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
  candidates.push(disjointStart);
  candidates.push(largestCongruent(disjointStart, high, pageSize - 1, pageSize));
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

const distanceToRequired = (block: number, required: readonly number[]): number => {
  let nearest = Number.POSITIVE_INFINITY;
  for (const page of required) nearest = Math.min(nearest, Math.abs(page - block));
  return nearest;
};

const inGap = (block: number, gap: BlockRange | null): boolean =>
  gap !== null && block >= gap.start && block < gap.end;

/** Nearest required pages first, ascending block index breaking ties. */
const orderOptional = (
  candidates: readonly number[],
  required: readonly number[],
  gap: BlockRange | null,
): number[] =>
  [...new Set(candidates)]
    .filter((block) => inGap(block, gap) === false)
    .map((block) => ({ block, distance: distanceToRequired(block, required) }))
    .sort((a, b) => a.distance - b.distance || a.block - b.block)
    .map((entry) => entry.block);

/**
 * Optional pages admitted while capacity remains: overscan before prefetch,
 * nearest first. Required pages count against the cap even before they load.
 */
export const admitOptionalPages = (input: OptionalPageAdmission): number[] => {
  const required = new Set(input.required);
  const used = new Set([...required, ...input.loaded, ...input.reserved]);
  const capacity = Math.max(normalizePositiveInteger(input.maxPages), required.size);
  const admitted: number[] = [];
  for (const group of [input.overscan ?? [], input.prefetch ?? []]) {
    for (const block of orderOptional(group, input.required, input.gap ?? null)) {
      if (used.size >= capacity) return admitted;
      if (used.has(block)) continue;
      used.add(block);
      admitted.push(block);
    }
  }
  return admitted;
};

export interface EvictionInput {
  loaded: readonly number[];
  protectedBlocks: readonly number[];
  center: number;
}

/**
 * Loaded pages that may be evicted: unprotected ones, farthest from the
 * center first; ties keep load order, as the flat loader always did.
 */
export const evictionCandidates = (input: EvictionInput): number[] => {
  const protectedSet = new Set(input.protectedBlocks);
  return input.loaded
    .filter((block) => protectedSet.has(block) === false)
    .sort((a, b) => Math.abs(b - input.center) - Math.abs(a - input.center));
};

/** Prefix blocks for the current count; blocks outside it are reported as released. */
export const resolvePrefixReservations = (
  previous: readonly number[],
  frozenCount: number,
  pageSize: number,
): PrefixReservation => {
  const count = Number.isFinite(frozenCount) && frozenCount > 0 ? Math.trunc(frozenCount) : 0;
  const range = prefixRangeOf(count, normalizePositiveInteger(pageSize));
  const pages: number[] = [];
  if (range !== null) {
    for (let block = range.start; block < range.end; block++) pages.push(block);
  }
  const kept = new Set(pages);
  return { pages, released: previous.filter((block) => kept.has(block) === false) };
};
