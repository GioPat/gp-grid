// packages/core/src/utils/fill-helpers.ts

import type { CellPosition, CellRange } from "../types/basic";
import type { ColumnDefinition } from "../types/columns";
import type { GridCore } from "../grid-core";

export interface FillHandlePosition {
  top: number;
  left: number;
}

export interface CalculateFillHandlePositionParams<TData = unknown> {
  core: GridCore<TData>;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
}

const resolveTarget = (
  activeCell: CellPosition | null,
  selectionRange: CellRange | null,
): { row: number; col: number; minCol: number; maxCol: number } | null => {
  if (selectionRange) {
    return {
      row: Math.max(selectionRange.startRow, selectionRange.endRow),
      col: Math.max(selectionRange.startCol, selectionRange.endCol),
      minCol: Math.min(selectionRange.startCol, selectionRange.endCol),
      maxCol: Math.max(selectionRange.startCol, selectionRange.endCol),
    };
  }
  if (activeCell) {
    return {
      row: activeCell.row,
      col: activeCell.col,
      minCol: activeCell.col,
      maxCol: activeCell.col,
    };
  }
  return null;
};

const selectionIsEditable = (
  columns: readonly ColumnDefinition[],
  minCol: number,
  maxCol: number,
): boolean => {
  for (let col = minCol; col <= maxCol; col++) {
    const column = columns[col];
    if (column === undefined || column.hidden) continue;
    if (column.editable !== true) return false;
  }
  return true;
};

/**
 * Bottom-right corner of the active cell or selection, in rows-wrapper
 * coordinates (the space of `MOVE_SLOT.translateY`). Returns null when there
 * is no target, a selected column is not editable, or the row has no mounted
 * slot.
 */
export const calculateFillHandlePosition = <TData>(
  params: CalculateFillHandlePositionParams<TData>,
): FillHandlePosition | null => {
  const { core, activeCell, selectionRange } = params;
  const target = resolveTarget(activeCell, selectionRange);
  if (target === null) return null;
  if (selectionIsEditable(core.getColumns(), target.minCol, target.maxCol) === false) {
    return null;
  }
  if (core.getSlotGeneration(target.row) === -1) return null;

  const bounds = core.geometry.getCellBounds(target.row, target.col, "rows");
  if (bounds === undefined) return null;

  return {
    top: bounds.top + bounds.height - 5,
    left: bounds.left + bounds.width - 20,
  };
};
