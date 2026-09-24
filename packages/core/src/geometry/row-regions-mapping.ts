// packages/core/src/geometry/row-regions-mapping.ts
// Frozen/suffix row numerics: the suffix window and the compressed anchor, the
// region hit test, row clips and the vertical scroll target.

import type { AxisBounds } from "../types/geometry";
import type { RowMapper } from "./row-geometry";
import type { AxisWindow, VirtualAxis } from "./virtual-axis";

export type RowRegion = "frozen" | "suffix";

export interface RowRegionHit {
  readonly rowIndex: number;
  readonly rowRegion: RowRegion | null;
}

export interface RowRegionMappingInput {
  axis: VirtualAxis;
  mapper: RowMapper;
  frozenCount: number;
  frozenExtent: number;
  /** Effective body height; the frozen block is subtracted for the suffix. */
  viewportHeight: number;
  /** Effective DOM scroll sample the mapping is measured from. */
  scrollTop: number;
  overscan?: number;
}

export interface RowRegionScrollInput extends RowRegionMappingInput {
  rowHeight: number;
}

export interface RowRegionScrollCorrectionInput {
  mapper: RowMapper;
  frozenExtent: number;
  previousFrozenExtent: number;
}

const normalizeHeight = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

const logicalTopOf = (input: RowRegionMappingInput): number =>
  input.mapper.toLogicalScrollTop(input.scrollTop);

/** Height of the scrolling clip below the frozen block. */
export const getSuffixViewportHeight = (input: RowRegionMappingInput): number =>
  Math.max(0, normalizeHeight(input.viewportHeight) - input.frozenExtent);

/** Half-open suffix range over the clip `[logicalTop + frozenExtent, logicalTop + height)`. */
export const getSuffixWindow = (input: RowRegionMappingInput): AxisWindow => {
  const axisWindow = input.axis.getWindow(
    logicalTopOf(input) + input.frozenExtent,
    getSuffixViewportHeight(input),
    input.overscan ?? 0,
  );
  if (axisWindow.start >= input.frozenCount) return axisWindow;
  const start = input.frozenCount;
  return { start, end: Math.max(axisWindow.end, start) };
};

/** First suffix row visible at the clip top; the compressed anchor. */
export const getSuffixAnchorIndex = (input: RowRegionMappingInput): number => {
  const axis = input.axis;
  const offset = logicalTopOf(input) + input.frozenExtent;
  return Math.max(Math.min(Math.max(axis.indexAt(offset), 0), axis.count), input.frozenCount);
};

export const getSuffixAnchorOffset = (input: RowRegionMappingInput): number =>
  input.axis.getOffset(getSuffixAnchorIndex(input));

/** Rows-space position: frozen rows keep their content offset, suffix rows shift to the anchor. */
export const getRowRegionPosition = (
  input: RowRegionMappingInput,
  rowIndex: number,
): number => {
  const offset = input.axis.getOffset(rowIndex);
  if (rowIndex < input.frozenCount) return offset;
  if (input.mapper.hasVerticalCompression() === false) return offset;
  return offset - getSuffixAnchorOffset(input);
};

/**
 * Rows-wrapper offset; 0 without compression. With anchor offset `A`,
 * `wrapperOffset + position − scrollTop` equals `rowOffset − logicalTop`.
 */
export const getSuffixWrapperOffset = (input: RowRegionMappingInput): number => {
  if (input.mapper.hasVerticalCompression() === false) return 0;
  return input.scrollTop - (logicalTopOf(input) - getSuffixAnchorOffset(input));
};

/** Viewport-space top of a suffix row; keeps the A7 invariant `offset − logicalTop`. */
export const getSuffixRowViewportTop = (
  input: RowRegionMappingInput,
  rowIndex: number,
): number =>
  getSuffixWrapperOffset(input) + getRowRegionPosition(input, rowIndex) - input.scrollTop;

/** C5 hit test: the frozen band wins before scroll is applied; sentinels carry no region. */
export const hitTestRowRegion = (
  input: RowRegionMappingInput,
  viewportY: number,
): RowRegionHit => {
  const axis = input.axis;
  if (axis.count === 0) return { rowIndex: -1, rowRegion: null };
  if (input.frozenCount > 0) {
    if (viewportY < 0) return { rowIndex: -1, rowRegion: null };
    if (viewportY < input.frozenExtent) {
      const frozenIndex = Math.min(Math.max(axis.indexAt(viewportY), 0), input.frozenCount - 1);
      return { rowIndex: frozenIndex, rowRegion: "frozen" };
    }
  }
  const index = axis.indexAt(viewportY + logicalTopOf(input));
  if (index < 0 || index >= axis.count) return { rowIndex: index, rowRegion: null };
  return { rowIndex: Math.max(index, input.frozenCount), rowRegion: "suffix" };
};

/** C5 clip: viewport y-range of the region the row renders in. */
export const getRowClip = (
  input: RowRegionMappingInput,
  rowIndex: number,
): AxisBounds | undefined => {
  if (Number.isSafeInteger(rowIndex) === false || rowIndex < 0 || rowIndex >= input.axis.count) {
    return undefined;
  }
  if (rowIndex < input.frozenCount) return { start: 0, end: input.frozenExtent };
  return { start: input.frozenExtent, end: normalizeHeight(input.viewportHeight) };
};

/** C6: a suffix row aligns inside the suffix clip; a frozen row never moves. */
export const resolveRowRegionScrollTop = (
  input: RowRegionScrollInput,
  rowIndex: number,
): number | undefined => {
  if (rowIndex < input.frozenCount || rowIndex >= input.axis.count) return undefined;
  const { axis, mapper, rowHeight, frozenExtent } = input;
  const suffixHeight = getSuffixViewportHeight(input);
  const rowLogical = mapper.toLogicalScrollTop(input.scrollTop);
  const logicalTop = axis.getOffset(rowIndex);
  const logicalBottom = logicalTop + rowHeight;

  if (rowHeight >= suffixHeight) {
    const aligned = Math.max(0, logicalTop - frozenExtent);
    return aligned === rowLogical ? undefined : mapper.toDomScrollTopClamped(aligned);
  }
  if (logicalTop < rowLogical + frozenExtent) {
    return mapper.toDomScrollTopClamped(Math.max(0, logicalTop - frozenExtent));
  }
  if (logicalBottom <= rowLogical + normalizeHeight(input.viewportHeight)) return undefined;

  const wanted = logicalBottom - normalizeHeight(input.viewportHeight);
  const boundary = axis.indexAt(wanted);
  const snapped = boundary < axis.count && axis.getOffset(boundary) < wanted
    ? axis.getOffset(boundary + 1)
    : axis.getOffset(boundary);
  return mapper.toDomScrollTopClamped(snapped);
};

/**
 * C12: a growing frozen block lowers the logical top by the extent delta, so
 * the suffix row at the clip top keeps its place below the block. Shrinking is
 * deliberately uncorrected: the reachable maximum is frozen-independent and
 * the read-time clamp already holds the sample.
 */
export const resolveRegionScrollCorrection = (
  input: RowRegionScrollCorrectionInput,
): number | null => {
  const delta = input.frozenExtent - input.previousFrozenExtent;
  if (delta <= 0) return null;
  const { mapper } = input;
  const logicalTop = mapper.getLogicalScrollTop();
  const corrected = mapper.toDomScrollTopClamped(Math.max(0, logicalTop - delta));
  const current = mapper.toDomScrollTopClamped(logicalTop);
  return corrected === current ? null : corrected;
};
