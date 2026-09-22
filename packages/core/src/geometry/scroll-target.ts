// packages/core/src/geometry/scroll-target.ts
// Minimal scroll needed to bring one cell into view. Axes already in view are
// omitted so the caller leaves them untouched.

import type {
  AxisBounds,
  ColumnLayoutSnapshot,
  ColumnRegion,
  DisplayedColumn,
  ScrollTarget,
} from "../types/geometry";
import type { RowMapper } from "./row-geometry";
import type { VirtualAxis } from "./virtual-axis";

export interface ScrollTargetInput {
  axis: VirtualAxis;
  mapper: RowMapper;
  layout: ColumnLayoutSnapshot;
  column: DisplayedColumn;
  /** Effective region the target column renders in. */
  region: ColumnRegion;
  /** Viewport x-range the center columns scroll inside. */
  centerClip: AxisBounds;
  viewIndex: number;
  rowHeight: number;
  viewport: { width: number; height: number };
  /** DOM scroll sample the target is measured from. */
  from: { scrollTop: number; scrollLeft: number };
}

const resolveScrollTop = (input: ScrollTargetInput): number | undefined => {
  const { axis, mapper, viewIndex, rowHeight, viewport } = input;
  const rowLogical = mapper.toLogicalScrollTop(input.from.scrollTop);
  const logicalTop = axis.getOffset(viewIndex);
  const logicalBottom = logicalTop + rowHeight;

  if (rowHeight >= viewport.height) {
    return logicalTop === rowLogical ? undefined : mapper.toDomScrollTopClamped(logicalTop);
  }
  if (logicalTop < rowLogical) return mapper.toDomScrollTopClamped(logicalTop);
  if (logicalBottom <= rowLogical + viewport.height) return undefined;

  const wanted = logicalBottom - viewport.height;
  const boundary = axis.indexAt(wanted);
  const snapped = boundary < axis.count && axis.getOffset(boundary) < wanted
    ? axis.getOffset(boundary + 1)
    : axis.getOffset(boundary);
  return mapper.toDomScrollTopClamped(snapped);
};

/**
 * Center columns align inside the scrolling clip, not the whole viewport, so
 * a target is never hidden behind an admitted pin. An admitted pin needs no
 * horizontal movement at all.
 *
 * The clip arrives in viewport px; the column's edges are content px, and
 * `scrollLeft` is the content-space sample the center scrolls by, so both
 * clip edges move by it before they can be compared.
 */
const resolveScrollLeft = (input: ScrollTargetInput): number | undefined => {
  if (input.region !== "center") return undefined;
  const { column, layout, viewport, centerClip, from } = input;
  if (layout.regions.centerViewportWidth <= 0) return undefined;
  const left = column.offset;
  const right = left + column.width;
  const maxScroll = Math.max(0, layout.totalWidth - viewport.width);
  const clipStart = from.scrollLeft + centerClip.start;
  const clipEnd = from.scrollLeft + centerClip.end;
  // The column is placed at the clip's inline start, so its content offset is
  // converted with the sample the clip was derived from.
  const alignedToStart = left - centerClip.start;
  if (column.width >= layout.regions.centerViewportWidth) {
    // Too wide for the center: show its inline start rather than the whole column.
    if (alignedToStart === from.scrollLeft) return undefined;
    return Math.min(Math.max(alignedToStart, 0), maxScroll);
  }
  if (left < clipStart) return Math.min(Math.max(alignedToStart, 0), maxScroll);
  if (right > clipEnd) return Math.min(Math.max(right - centerClip.end, 0), maxScroll);
  return undefined;
};

export const resolveScrollTarget = (input: ScrollTargetInput): ScrollTarget => {
  const target: { scrollTop?: number; scrollLeft?: number } = {};
  const scrollTop = resolveScrollTop(input);
  if (scrollTop !== undefined) target.scrollTop = scrollTop;
  const scrollLeft = resolveScrollLeft(input);
  if (scrollLeft !== undefined) target.scrollLeft = scrollLeft;
  return target;
};
