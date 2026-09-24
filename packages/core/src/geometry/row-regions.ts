// packages/core/src/geometry/row-regions.ts
// Pure frozen-row admission (C2) and the row region layout (C3). Every input
// is numeric and injected, so no manager and no DOM dependency reaches this
// module; the page budget arrives as a numeric predicate.

import type { VirtualAxis } from "./virtual-axis";

export type FrozenRowsLimit = "maxCount" | "cache" | "viewport" | null;

export interface FrozenRowsState {
  readonly requestedCount: number;
  readonly effectiveCount: number;
  readonly limit: FrozenRowsLimit;
}

export interface FrozenRowsInput {
  axis: VirtualAxis;
  requestedCount: number;
  /** Body content-area height; replaced by the estimate while unmeasured. */
  viewportHeight: number;
  viewportMeasured: boolean;
  maxCount?: number;
  minSuffixHeight?: number;
  /** C8 page budget: true while a prefix of this size fits the page cap. */
  admitsPrefix?: (count: number) => boolean;
}

export interface RowRegionLayout {
  readonly frozenCount: number;
  readonly frozenExtent: number;
  readonly suffixViewportHeight: number;
  readonly frozen: FrozenRowsState;
}

export const DEFAULT_MAX_FROZEN_ROWS = 100;
export const DEFAULT_MIN_SUFFIX_HEIGHT = 64;
/** Mirrors ViewportState's estimate; geometry must not import a manager. */
export const UNMEASURED_VIEWPORT_HEIGHT = 600;

const normalizeCount = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;

const normalizeHeight = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

const maxCountOf = (input: FrozenRowsInput): number =>
  input.maxCount === undefined ? DEFAULT_MAX_FROZEN_ROWS : normalizeCount(input.maxCount);

const minSuffixHeightOf = (input: FrozenRowsInput): number =>
  input.minSuffixHeight === undefined
    ? DEFAULT_MIN_SUFFIX_HEIGHT
    : normalizeHeight(input.minSuffixHeight);

const viewportHeightOf = (input: FrozenRowsInput): number =>
  input.viewportMeasured ? normalizeHeight(input.viewportHeight) : UNMEASURED_VIEWPORT_HEIGHT;

/** Freezing every row needs no suffix, so the minimum only constrains a prefix. */
const fitsViewport = (
  input: FrozenRowsInput,
  count: number,
  viewportHeight: number,
): boolean => {
  const suffixHeight = count < input.axis.count ? minSuffixHeightOf(input) : 0;
  return input.axis.getOffset(count) + suffixHeight <= viewportHeight;
};

/** Largest positive count that fits; 0 when none does, which stays valid. */
const largestFittingCount = (
  input: FrozenRowsInput,
  from: number,
  viewportHeight: number,
): number => {
  for (let count = from; count >= 1; count--) {
    if (fitsViewport(input, count, viewportHeight)) return count;
  }
  return 0;
};

export const resolveFrozenRows = (input: FrozenRowsInput): FrozenRowsState => {
  const requestedCount = normalizeCount(input.requestedCount);
  if (requestedCount === 0 || input.axis.count === 0) {
    return { requestedCount, effectiveCount: 0, limit: null };
  }

  // A row-count shortfall leaves fewer rows frozen but is not a limit.
  const shortfall = Math.min(requestedCount, input.axis.count);
  const capped = Math.min(shortfall, maxCountOf(input));
  const capLimit: FrozenRowsLimit = capped < shortfall ? "maxCount" : null;

  const viewportHeight = viewportHeightOf(input);
  const viewportCount = capped > 0 ? largestFittingCount(input, capped, viewportHeight) : 0;
  const afterViewport: FrozenRowsState = {
    requestedCount,
    effectiveCount: viewportCount,
    limit: viewportCount < capped ? "viewport" : capLimit,
  };
  if (viewportCount === 0 || input.admitsPrefix === undefined) return afterViewport;
  if (input.admitsPrefix(viewportCount)) return afterViewport;

  // C8: the largest count within the page budget. Reducing an all-frozen
  // candidate creates a suffix, so the viewport condition is rechecked.
  for (let count = viewportCount - 1; count >= 1; count--) {
    if (input.admitsPrefix(count) && fitsViewport(input, count, viewportHeight)) {
      return { requestedCount, effectiveCount: count, limit: "cache" };
    }
  }
  return { requestedCount, effectiveCount: 0, limit: "cache" };
};

const isSameLayout = (
  previous: RowRegionLayout,
  frozen: FrozenRowsState,
  frozenExtent: number,
  suffixViewportHeight: number,
): boolean =>
  previous.frozenCount === frozen.effectiveCount &&
  previous.frozenExtent === frozenExtent &&
  previous.suffixViewportHeight === suffixViewportHeight &&
  previous.frozen.requestedCount === frozen.requestedCount &&
  previous.frozen.limit === frozen.limit;

/** C3 layout; pass the last one to keep its identity while nothing changed. */
export const resolveRowRegionLayout = (
  input: FrozenRowsInput,
  previous?: RowRegionLayout,
): RowRegionLayout => {
  const frozen = resolveFrozenRows(input);
  const frozenExtent = input.axis.getOffset(frozen.effectiveCount);
  const suffixViewportHeight = Math.max(0, viewportHeightOf(input) - frozenExtent);
  if (previous !== undefined && isSameLayout(previous, frozen, frozenExtent, suffixViewportHeight)) {
    return previous;
  }
  return { frozenCount: frozen.effectiveCount, frozenExtent, suffixViewportHeight, frozen };
};
