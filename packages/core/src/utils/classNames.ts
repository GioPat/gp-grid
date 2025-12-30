// packages/core/src/utils/classNames.ts

import type { CellPosition, CellRange } from "../types";

/**
 * Check if a cell is within the selection range
 */
export function isCellSelected(
  row: number,
  col: number,
  selectionRange: CellRange | null,
): boolean {
  if (!selectionRange) return false;

  const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
  const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
  const minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
  const maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);

  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
}

/**
 * Check if a cell is the active cell
 */
export function isCellActive(
  row: number,
  col: number,
  activeCell: CellPosition | null,
): boolean {
  return activeCell?.row === row && activeCell?.col === col;
}

/**
 * Check if a row is within the visible range (not in overscan)
 */
export function isRowVisible(
  row: number,
  visibleRowRange: { start: number; end: number } | null,
): boolean {
  // No range or invalid range means show everything (permissive default)
  if (!visibleRowRange) return true;
  // If end is negative or less than start, the range is invalid - show everything
  if (visibleRowRange.end < 0 || visibleRowRange.start > visibleRowRange.end) return true;
  return row >= visibleRowRange.start && row <= visibleRowRange.end;
}

/**
 * Check if a cell is being edited
 */
export function isCellEditing(
  row: number,
  col: number,
  editingCell: { row: number; col: number } | null,
): boolean {
  return editingCell?.row === row && editingCell?.col === col;
}

/**
 * Check if a cell is in the fill preview range (vertical-only fill)
 */
export function isCellInFillPreview(
  row: number,
  col: number,
  isDraggingFill: boolean,
  fillSourceRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null,
  fillTarget: { row: number; col: number } | null,
): boolean {
  if (!isDraggingFill || !fillSourceRange || !fillTarget) return false;

  const srcMinRow = Math.min(fillSourceRange.startRow, fillSourceRange.endRow);
  const srcMaxRow = Math.max(fillSourceRange.startRow, fillSourceRange.endRow);
  const srcMinCol = Math.min(fillSourceRange.startCol, fillSourceRange.endCol);
  const srcMaxCol = Math.max(fillSourceRange.startCol, fillSourceRange.endCol);

  // Determine fill direction (vertical only)
  const fillDown = fillTarget.row > srcMaxRow;
  const fillUp = fillTarget.row < srcMinRow;

  // Check if cell is in the fill preview area (not the source area)
  if (fillDown) {
    return (
      row > srcMaxRow &&
      row <= fillTarget.row &&
      col >= srcMinCol &&
      col <= srcMaxCol
    );
  }
  if (fillUp) {
    return (
      row < srcMinRow &&
      row >= fillTarget.row &&
      col >= srcMinCol &&
      col <= srcMaxCol
    );
  }

  return false;
}

/**
 * Build cell CSS classes based on state
 */
export function buildCellClasses(
  isActive: boolean,
  isSelected: boolean,
  isEditing: boolean,
  inFillPreview: boolean,
): string {
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
}
