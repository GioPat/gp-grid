// packages/core/src/utils/fill-helpers.ts

import type { CellPosition, CellRange } from "../types/basic";
import type { ColumnDefinition } from "../types/columns";
import type { ColumnRegion, RowRegion } from "../types/geometry";
import type { GridCore } from "../grid-core";

export interface FillHandlePosition {
  top: number;
  left: number;
  /**
   * Region the anchored cell renders in. `left` is relative to that region's
   * container (the rows wrapper for `"center"`).
   */
  region: ColumnRegion;
  /** Row region the anchored cell renders in; `top` is frozen-local for `"frozen"`. */
  rowRegion: RowRegion;
}

export interface CalculateFillHandlePositionParams<TData = unknown> {
  core: GridCore<TData>;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
}

/** Distance the handle sits inside its cell's inline end. */
const HANDLE_INSET = 20;

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
 * Bottom-right corner of the active cell or selection. `left` is relative to
 * the container the cell renders in: the rows wrapper for center columns, the
 * region container for pins. Returns null when there is no target, a selected
 * column is not editable, the row has no mounted slot, or the anchor sits
 * outside the scrolling clip (a pin covers it).
 */
export const calculateFillHandlePosition = <TData>(
  params: CalculateFillHandlePositionParams<TData>,
): FillHandlePosition | null => {
  const { core, activeCell, selectionRange } = params;
  const target = resolveTarget(activeCell, selectionRange);
  if (target === null) return null;
  if (selectionIsEditable(core.columns.get(), target.minCol, target.maxCol) === false) {
    return null;
  }
  if (core.rows.getSlotGeneration(target.row) === -1) return null;

  // A pin is mounted in its own region container, so its displayed column
  // carries a region-local left; `rows` bounds are content x for the center.
  const column = core.geometry.getColumn(target.col);
  if (column === undefined) return null;
  const viewport = core.geometry.getColumnBounds(target.col, "viewport");
  const bounds = core.geometry.getCellBounds(target.row, target.col, "rows");
  if (viewport === undefined || bounds === undefined) return null;
  if (bounds.top + bounds.height <= 0) return null;

  const { region, regionOffset, width } = column;
  const anchorX = viewport.start + width - HANDLE_INSET;
  if (region === "center") {
    const clip = core.geometry.getCenterClip();
    // A pin covering the handle's own anchor or the whole cell hides it.
    if (viewport.end <= clip.start || viewport.start >= clip.end) return null;
    if (anchorX < clip.start || anchorX >= clip.end) return null;
  }

  const containerLeft = region === "center" ? bounds.left : regionOffset;
  const rowRegion = target.row < core.geometry.getRowRegions().frozenCount
    ? "frozen"
    : "suffix";
  return {
    top: bounds.top + bounds.height - 5,
    left: containerLeft + width - HANDLE_INSET,
    region,
    rowRegion,
  };
};
