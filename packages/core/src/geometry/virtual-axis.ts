// packages/core/src/geometry/virtual-axis.ts

import { assertOverscan } from "./offsets";

/** Half-open index window: `[start, end)`; empty windows have `start === end`. */
export interface AxisWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * Numeric 1D size axis. Indices are safe integers; `indexAt` uses the grid
 * sentinel convention (`-1` before the axis, `count` at or past its end).
 */
export interface VirtualAxis {
  readonly count: number;
  readonly extent: number;
  getSize(index: number): number;
  getOffset(index: number): number;
  indexAt(offset: number): number;
  getWindow(offset: number, viewportExtent: number, overscan?: number): AxisWindow;
}

/**
 * Shared window rules: intersect `[offset, offset + viewportExtent)` with the
 * content, then widen by whole items. A window with no intersection stays
 * empty and anchored at the nearest item boundary regardless of overscan.
 */
export const windowOf = (
  axis: VirtualAxis,
  offset: number,
  viewportExtent: number,
  overscan = 0,
): AxisWindow => {
  assertOverscan(overscan);
  const anchor = (index: number): AxisWindow => {
    const clamped = Math.min(Math.max(index, 0), axis.count);
    return { start: clamped, end: clamped };
  };

  if (!Number.isFinite(offset) || !Number.isFinite(viewportExtent) || viewportExtent <= 0) {
    return anchor(axis.indexAt(offset));
  }

  const startIndex = Math.max(axis.indexAt(offset), 0);
  const endOffset = Math.min(offset + viewportExtent, axis.extent);
  const boundary = Math.max(axis.indexAt(endOffset), 0);
  // The window is half-open: an item starting exactly at the end offset is
  // excluded, one containing that offset is included.
  const endIndex = boundary < axis.count && axis.getOffset(boundary) < endOffset
    ? boundary + 1
    : boundary;
  if (startIndex >= endIndex) {
    return anchor(startIndex);
  }

  return {
    start: Math.max(startIndex - overscan, 0),
    end: Math.min(endIndex + overscan, axis.count),
  };
};
