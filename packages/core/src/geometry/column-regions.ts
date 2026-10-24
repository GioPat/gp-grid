// packages/core/src/geometry/column-regions.ts
// Pure pin admission. Widths are already resolved in content space; this
// decides which pins fit the viewport and where each region starts.
//
// Precedence is explicit and deterministic: start pins are walked
// outer→inner, then end pins outer→inner on what is left. The first pin that
// does not fit closes its region, so admitted pins stay contiguous and fully
// visible, start wins over end, and an over-wide pin leaves the whole
// viewport to the scrolling center. A rejected pin keeps its layout index and
// renders as a center column; its request persists and is re-admitted when
// the viewport widens.

import type {
  ColumnPin,
  ColumnRegion,
  ColumnRegionLayout,
  DisplayedColumn,
  ResolvedColumn,
} from "../types/geometry";

/** An empty layout: no pins admitted, nothing left for the center. */
export const EMPTY_REGION_LAYOUT: ColumnRegionLayout = {
  centerStart: 0,
  centerEnd: 0,
  startWidth: 0,
  endWidth: 0,
  endOffset: 0,
  centerViewportWidth: 0,
};

/**
 * Number of leading positions in `indices` whose cumulative width fits
 * `maxWidth`. `indices` must already be ordered outer→inner.
 */
const admittedCount = (
  widths: readonly number[],
  indices: readonly number[],
  maxWidth: number,
): number => {
  let used = 0;
  let admitted = 0;
  for (const index of indices) {
    const next = used + widths[index]!;
    if (next > maxWidth) break;
    used = next;
    admitted += 1;
  }
  return admitted;
};

const pinIndices = (
  columns: readonly DisplayedColumn[],
  pin: ColumnPin,
): number[] => {
  const indices: number[] = [];
  for (let index = 0; index < columns.length; index++) {
    if (columns[index]!.column.pinned === pin) indices.push(index);
  }
  return indices;
};

const sumWidths = (
  widths: readonly number[],
  indices: readonly number[],
): number => {
  let total = 0;
  for (const index of indices) total += widths[index]!;
  return total;
};

/**
 * The end region starts at the viewport x that keeps it inside the viewport
 * when the content is wider, and abuts the last center column when the
 * content is narrower than the viewport.
 */
const endOffsetOf = (
  totalWidth: number,
  viewportWidth: number,
  endWidth: number,
): number => Math.min(totalWidth, viewportWidth) - endWidth;

/** Effective region of a displayed index given the admitted boundaries. */
export const regionAtIndex = (
  index: number,
  centerStart: number,
  centerEnd: number,
): ColumnRegion => {
  if (index < centerStart) return "start";
  if (index >= centerEnd) return "end";
  return "center";
};

export const getColumnRegionLayout = (
  columns: readonly ResolvedColumn[] | readonly DisplayedColumn[],
  viewportWidth: number,
  totalWidth: number,
): ColumnRegionLayout => {
  if (columns.length === 0) return EMPTY_REGION_LAYOUT;

  // The pin is carried by the resolved definition, so admission reads the
  // same source the partition does.
  const widths = columns.map((column) => column.width);
  const startCandidates = pinIndices(columns, "start");
  // Outer→inner for end pins means rightmost first: the last admitted end pin
  // abuts the viewport edge and the region grows leftwards.
  const endCandidates = [...pinIndices(columns, "end")].reverse();

  // An unmeasured viewport admits every pin: SSR and the frame before the
  // first measurement stay deterministic and non-empty.
  const admitsAll = Number.isFinite(viewportWidth) === false || viewportWidth <= 0;
  const startCount = admitsAll
    ? startCandidates.length
    : admittedCount(widths, startCandidates, viewportWidth);
  const startWidth = sumWidths(widths, startCandidates.slice(0, startCount));
  const endCount = admitsAll
    ? endCandidates.length
    : admittedCount(widths, endCandidates, Math.max(0, viewportWidth - startWidth));
  const admittedEnd = endCandidates.slice(0, endCount);
  const endWidth = sumWidths(widths, admittedEnd);
  // A rejected end pin renders as a center column, so the center region is
  // everything between the admitted start and admitted end pins.
  const centerStart = startCount;
  const centerEnd = admittedEnd.length === 0
    ? columns.length - endCount
    : Math.min(...admittedEnd);

  return {
    centerStart,
    centerEnd,
    startWidth,
    endWidth,
    endOffset: endOffsetOf(totalWidth, viewportWidth, endWidth),
    centerViewportWidth: Math.max(0, viewportWidth - startWidth - endWidth),
  };
};
