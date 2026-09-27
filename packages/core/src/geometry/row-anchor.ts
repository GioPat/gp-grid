// packages/core/src/geometry/row-anchor.ts
// D5 anchoring for a size change: the suffix row the clip top sits in, and the
// DOM scroll top that puts it back after the sizes moved. Pure over the C5
// frame, so it stays independent of managers, GridCore and the DOM.

import type { RowRegionMappingInput } from "./row-regions-mapping";
import { getSuffixAnchorIndex, getSuffixViewportHeight } from "./row-regions-mapping";

/** The suffix row under the clip top, and how far into it the clip top sits. */
export interface RowAnchor {
  readonly index: number;
  readonly intra: number;
}

const clipTopOf = (frame: RowRegionMappingInput): number =>
  frame.mapper.toLogicalScrollTop(frame.scrollTop) + frame.frozenExtent;

/** No anchor without a suffix clip and a suffix row under the clip top. */
export const captureRowAnchor = (frame: RowRegionMappingInput): RowAnchor | null => {
  if (getSuffixViewportHeight(frame) <= 0) return null;
  const index = getSuffixAnchorIndex(frame);
  if (index >= frame.axis.count) return null;
  return { index, intra: clipTopOf(frame) - frame.axis.getOffset(index) };
};

/** A row that left the suffix resets to the first one, with no intra offset. */
const resolveAnchor = (anchor: RowAnchor, frame: RowRegionMappingInput): RowAnchor => {
  const { axis, frozenCount } = frame;
  if (anchor.index >= axis.count) return { index: axis.count - 1, intra: 0 };
  if (anchor.index < frozenCount) return { index: frozenCount, intra: 0 };
  return anchor;
};

/**
 * The DOM scroll top that restores `anchor` under the clip top, or `null` when
 * the current sample already does or when there is no suffix to anchor to.
 */
export const resolveAnchoredScrollTop = (
  anchor: RowAnchor,
  frame: RowRegionMappingInput,
): number | null => {
  if (getSuffixViewportHeight(frame) <= 0) return null;
  const { axis, frozenExtent } = frame;
  if (axis.count <= frame.frozenCount) return null;
  const { index, intra } = resolveAnchor(anchor, frame);
  const size = axis.getSize(index);
  const logicalTop =
    axis.getOffset(index) + Math.max(0, Math.min(intra, size)) - frozenExtent;
  const domScrollTop = frame.mapper.toDomScrollTopClamped(Math.max(0, logicalTop));
  return domScrollTop === frame.scrollTop ? null : domScrollTop;
};
