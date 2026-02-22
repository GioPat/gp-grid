// packages/core/src/utils/fill-helpers.ts

import type { CellPosition, CellRange } from "../types/basic";
import type { ColumnDefinition } from "../types/columns";
import type { SlotData } from "../types/ui-state";

export interface VisibleColumnInfo {
  column: ColumnDefinition;
  originalIndex: number;
}

export interface FillHandlePosition {
  top: number;
  left: number;
}

export interface CalculateFillHandlePositionParams {
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  slots: Map<string, SlotData>;
  columns: ColumnDefinition[];
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnPositions: number[];
  columnWidths: number[];
  rowHeight: number;
}

/**
 * Calculate the fill handle position (bottom-right corner of active cell or selection).
 * Returns null if no cell is active, columns are not editable, or the target is not visible.
 */
export const calculateFillHandlePosition = (
  params: CalculateFillHandlePositionParams,
): FillHandlePosition | null => {
  const {
    activeCell,
    selectionRange,
    slots,
    columns,
    visibleColumnsWithIndices,
    columnPositions,
    columnWidths,
    rowHeight,
  } = params;

  if (!activeCell && !selectionRange) return null;

  let row: number, col: number;
  let minCol: number, maxCol: number;

  if (selectionRange) {
    row = Math.max(selectionRange.startRow, selectionRange.endRow);
    col = Math.max(selectionRange.startCol, selectionRange.endCol);
    minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
    maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);
  } else if (activeCell) {
    row = activeCell.row;
    col = activeCell.col;
    minCol = col;
    maxCol = col;
  } else {
    return null;
  }

  // Check if ALL columns in the selection are editable (skip hidden columns)
  for (let c = minCol; c <= maxCol; c++) {
    const column = columns[c];
    if (!column || column.hidden) continue;
    if (column.editable !== true) {
      return null;
    }
  }

  // Find the visible index for the target column
  const visibleIndex = visibleColumnsWithIndices.findIndex(
    (v) => v.originalIndex === col,
  );
  if (visibleIndex === -1) return null;

  // Find the slot for this row and use its actual translateY
  let cellTop: number | null = null;
  for (const slot of slots.values()) {
    if (slot.rowIndex === row) {
      cellTop = slot.translateY;
      break;
    }
  }

  if (cellTop === null) return null;

  const cellLeft = columnPositions[visibleIndex] ?? 0;
  const cellWidth = columnWidths[visibleIndex] ?? 0;

  return {
    top: cellTop + rowHeight - 5,
    left: cellLeft + cellWidth - 20,
  };
};
