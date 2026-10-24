// packages/core/src/managers/page-blocks.ts
// Page blocks for C8: block ranges, and the prefix/suffix blocks a scroll
// position requires.

import type { AxisWindow, VirtualAxis } from "../geometry/virtual-axis";
import { clampCount, normalizePositiveInteger, normalizeSize } from "../utils/number-guards";

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

export const prefixRangeOf = (frozenCount: number, pageSize: number): BlockRange | null =>
  frozenCount > 0
    ? { start: 0, end: Math.floor((frozenCount - 1) / pageSize) + 1 }
    : null;

export const rangeOfWindow = (axisWindow: AxisWindow, pageSize: number): BlockRange | null =>
  axisWindow.end > axisWindow.start
    ? {
      start: Math.floor(axisWindow.start / pageSize),
      end: Math.floor((axisWindow.end - 1) / pageSize) + 1,
    }
    : null;

export const blockCountOf = (range: BlockRange | null): number =>
  range === null ? 0 : range.end - range.start;

/** Every block index in a range, ascending. */
export const blocksOfRange = (range: BlockRange | null): number[] => {
  if (range === null) return [];
  return Array.from({ length: range.end - range.start }, (_, index) => range.start + index);
};

/** Union size of two ranges; touching ranges merge, a real gap keeps them apart. */
export const unionSize = (a: BlockRange | null, b: BlockRange | null): number => {
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

/** Height of the scrolling clip below `frozenCount` frozen rows. */
export const clipHeightOf = (input: PageCapacityInput, frozenCount: number): number =>
  Math.max(0, normalizeSize(input.viewportHeight) - input.axis.getOffset(frozenCount));

/** Every block index intersecting a half-open row window. */
export const getWindowPageBlocks = (window: AxisWindow, pageSize: number): number[] =>
  blocksOfRange(rangeOfWindow(window, normalizePositiveInteger(pageSize)));

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
