// packages/core/src/geometry/scroll-target.ts
// Minimal scroll needed to bring one cell into view. Axes already in view are
// omitted so the caller leaves them untouched.

import type { ColumnLayoutSnapshot, DisplayedColumn, ScrollTarget } from "../types/geometry";
import type { RowMapper } from "./row-geometry";
import type { VirtualAxis } from "./virtual-axis";

export interface ScrollTargetInput {
  axis: VirtualAxis;
  mapper: RowMapper;
  layout: ColumnLayoutSnapshot;
  column: DisplayedColumn;
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

const resolveScrollLeft = (input: ScrollTargetInput): number | undefined => {
  const { column, layout, viewport } = input;
  const startLeft = input.from.scrollLeft;
  const left = column.offset;
  const right = left + column.width;
  const maxLeft = Math.max(0, layout.totalWidth - viewport.width);
  if (column.width >= viewport.width) {
    return left === startLeft ? undefined : Math.min(Math.max(left, 0), maxLeft);
  }
  if (left < startLeft) return Math.max(left, 0);
  if (right > startLeft + viewport.width) return Math.min(right - viewport.width, maxLeft);
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
