// packages/core/src/utils/positioning.ts

import { buildOffsets, searchOffsets } from "../geometry/offsets";

/**
 * Cumulative column positions (prefix sums) over exactly the supplied list,
 * including hidden entries. Returns `columns.length + 1` entries; the last is
 * the total width. Widths must be positive and finite — this standalone
 * helper does not apply the grid's fallback width.
 */
export const calculateColumnPositions = (columns: readonly { width: number }[]): number[] =>
  buildOffsets(columns.map((column) => column.width));

/**
 * Get total width from column positions
 */
export const getTotalWidth = (columnPositions: number[]): number =>
  columnPositions.at(-1) ?? 0;

/**
 * Find the column index at a content-space X coordinate, using half-open
 * edges and clamping outside them: `0` before the first column, the last index
 * at or past the end. An empty list or a `NaN` coordinate answers `-1`.
 */
export const findColumnAtX = (x: number, columnPositions: number[]): number => {
  if (Number.isNaN(x)) return -1;
  const count = columnPositions.length - 1;
  if (count <= 0) return -1;
  if (x >= columnPositions.at(-1)!) return count - 1;
  return Math.min(Math.max(searchOffsets(columnPositions, x), 0), count - 1);
};
