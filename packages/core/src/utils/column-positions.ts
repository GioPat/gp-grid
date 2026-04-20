import type { ColumnDefinition } from "../types";

/**
 * Compute the cumulative left-edge positions of each visible column.
 * Output is `columns.filter(visible).length + 1` entries: the first is 0,
 * each subsequent entry adds the previous column's width. Hidden columns
 * contribute nothing. The last entry equals the total content width.
 */
export const computeColumnPositions = (columns: ColumnDefinition[]): number[] => {
  const positions = [0];
  let pos = 0;
  for (const col of columns) {
    if (col.hidden) continue;
    pos += col.width;
    positions.push(pos);
  }
  return positions;
};
