// packages/core/src/utils/positioning.ts

import type { ColumnDefinition } from "../types";

/**
 * Calculate cumulative column positions (prefix sums)
 * Returns an array where positions[i] is the left position of column i
 * positions[columns.length] is the total width
 */
export const calculateColumnPositions = (columns: ColumnDefinition[]): number[] => {
  const positions = [0];
  let pos = 0;
  for (const col of columns) {
    pos += col.width;
    positions.push(pos);
  }
  return positions;
};

/**
 * Get total width from column positions
 */
export const getTotalWidth = (columnPositions: number[]): number =>
  columnPositions[columnPositions.length - 1] ?? 0;

/**
 * Calculate scaled column positions when container is wider than total column widths.
 * Columns expand proportionally based on their original width ratios.
 *
 * @param columns - Column definitions with original widths
 * @param containerWidth - Available container width
 * @returns Object with positions array and widths array
 */
export const calculateScaledColumnPositions = (
  columns: ColumnDefinition[],
  containerWidth: number,
): { positions: number[]; widths: number[] } => {
  const originalPositions = calculateColumnPositions(columns);
  const totalOriginalWidth = getTotalWidth(originalPositions);

  // If container is not wider than content, return original values
  if (containerWidth <= totalOriginalWidth || totalOriginalWidth === 0) {
    return {
      positions: originalPositions,
      widths: columns.map((col) => col.width),
    };
  }

  // Calculate scale factor
  const scaleFactor = containerWidth / totalOriginalWidth;

  // Scale each column proportionally
  const scaledWidths = columns.map((col) => col.width * scaleFactor);

  // Calculate new positions
  const scaledPositions = [0];
  let pos = 0;
  for (const width of scaledWidths) {
    pos += width;
    scaledPositions.push(pos);
  }

  return { positions: scaledPositions, widths: scaledWidths };
};

/**
 * Find column index at a given X coordinate
 */
export const findColumnAtX = (x: number, columnPositions: number[]): number => {
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
};
