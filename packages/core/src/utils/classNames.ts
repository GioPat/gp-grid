// packages/core/src/utils/classNames.ts

import type { CellPosition, CellRange } from "../types";

// =============================================================================
// Range Normalization
// =============================================================================

/**
 * Normalized range with guaranteed min/max values
 */
export interface NormalizedRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

/**
 * Normalize a cell range to ensure min/max values are correct
 * Handles ranges where start > end
 */
export const normalizeRange = (range: CellRange): NormalizedRange => ({
  minRow: Math.min(range.startRow, range.endRow),
  maxRow: Math.max(range.startRow, range.endRow),
  minCol: Math.min(range.startCol, range.endCol),
  maxCol: Math.max(range.startCol, range.endCol),
});

/**
 * Check if a cell position is within a normalized range
 */
export const isCellInRange = (
  row: number,
  col: number,
  range: NormalizedRange,
): boolean =>
  row >= range.minRow &&
  row <= range.maxRow &&
  col >= range.minCol &&
  col <= range.maxCol;

// =============================================================================
// Cell State Checks
// =============================================================================

/**
 * Check if a cell is within the selection range
 */
export const isCellSelected = (
  row: number,
  col: number,
  selectionRange: CellRange | null,
): boolean => {
  if (!selectionRange) return false;
  const range = normalizeRange(selectionRange);
  return isCellInRange(row, col, range);
};

/**
 * Check if a cell is the active cell
 */
export const isCellActive = (
  row: number,
  col: number,
  activeCell: CellPosition | null,
): boolean => activeCell?.row === row && activeCell?.col === col;

/**
 * Check if a row is within the visible range (not in overscan)
 */
export const isRowVisible = (
  row: number,
  visibleRowRange: { start: number; end: number } | null,
): boolean => {
  // No range or invalid range means show everything (permissive default)
  if (!visibleRowRange) return true;
  // If end is negative or less than start, the range is invalid - show everything
  if (visibleRowRange.end < 0 || visibleRowRange.start > visibleRowRange.end) return true;
  return row >= visibleRowRange.start && row <= visibleRowRange.end;
};

/**
 * Check if a cell is being edited
 */
export const isCellEditing = (
  row: number,
  col: number,
  editingCell: { row: number; col: number } | null,
): boolean => editingCell?.row === row && editingCell?.col === col;

/**
 * Check if a cell is in the fill preview range (vertical-only fill)
 */
export const isCellInFillPreview = (
  row: number,
  col: number,
  isDraggingFill: boolean,
  fillSourceRange: CellRange | null,
  fillTarget: { row: number; col: number } | null,
): boolean => {
  if (!isDraggingFill || !fillSourceRange || !fillTarget) return false;

  const { minRow, maxRow, minCol, maxCol } = normalizeRange(fillSourceRange);

  // Determine fill direction (vertical only)
  const fillDown = fillTarget.row > maxRow;
  const fillUp = fillTarget.row < minRow;

  // Check if cell is in the fill preview area (not the source area)
  if (fillDown) {
    return row > maxRow && row <= fillTarget.row && col >= minCol && col <= maxCol;
  }
  if (fillUp) {
    return row < minRow && row >= fillTarget.row && col >= minCol && col <= maxCol;
  }

  return false;
};

/**
 * Build cell CSS classes based on state
 */
export const buildCellClasses = (
  isActive: boolean,
  isSelected: boolean,
  isEditing: boolean,
  inFillPreview: boolean,
): string => {
  const classes = ["gp-grid-cell"];

  if (isActive) {
    classes.push("gp-grid-cell--active");
  }
  if (isSelected && !isActive) {
    classes.push("gp-grid-cell--selected");
  }
  if (isEditing) {
    classes.push("gp-grid-cell--editing");
  }
  if (inFillPreview) {
    classes.push("gp-grid-cell--fill-preview");
  }

  return classes.join(" ");
};

// =============================================================================
// Highlighting Helpers
// =============================================================================

/**
 * Check if a row overlaps the selection range
 */
export const isRowInSelectionRange = (
  rowIndex: number,
  range: CellRange | null,
): boolean => {
  if (!range) return false;
  const { minRow, maxRow } = normalizeRange(range);
  return rowIndex >= minRow && rowIndex <= maxRow;
};

/**
 * Check if a column overlaps the selection range
 */
export const isColumnInSelectionRange = (
  colIndex: number,
  range: CellRange | null,
): boolean => {
  if (!range) return false;
  const { minCol, maxCol } = normalizeRange(range);
  return colIndex >= minCol && colIndex <= maxCol;
};
