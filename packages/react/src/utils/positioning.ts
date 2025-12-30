// packages/react/src/utils/positioning.ts

import type { ColumnDefinition } from "gp-grid-core";

/**
 * Calculate cumulative column positions (prefix sums)
 * Returns an array where positions[i] is the left position of column i
 * positions[columns.length] is the total width
 */
export function calculateColumnPositions(columns: ColumnDefinition[]): number[] {
  const positions = [0];
  let pos = 0;
  for (const col of columns) {
    pos += col.width;
    positions.push(pos);
  }
  return positions;
}

/**
 * Get total width from column positions
 */
export function getTotalWidth(columnPositions: number[]): number {
  return columnPositions[columnPositions.length - 1] ?? 0;
}

/**
 * Find column index at a given X coordinate
 */
export function findColumnAtX(
  x: number,
  columnPositions: number[],
): number {
  for (let i = 0; i < columnPositions.length - 1; i++) {
    if (x >= columnPositions[i]! && x < columnPositions[i + 1]!) {
      return i;
    }
  }
  // If beyond last column, return last column
  if (x >= columnPositions[columnPositions.length - 1]!) {
    return columnPositions.length - 2;
  }
  return 0;
}
