// packages/vue/src/composables/useFillHandle.ts

import { computed, type ComputedRef } from "vue";
import type { CellPosition, CellRange, ColumnDefinition, SlotData } from "@gp-grid/core";

export interface VisibleColumnInfo {
  column: ColumnDefinition;
  originalIndex: number;
}

export interface UseFillHandleOptions {
  activeCell: ComputedRef<CellPosition | null>;
  selectionRange: ComputedRef<CellRange | null>;
  slots: ComputedRef<Map<string, SlotData>>;
  columns: ComputedRef<ColumnDefinition[]>;
  visibleColumnsWithIndices: ComputedRef<VisibleColumnInfo[]>;
  columnPositions: ComputedRef<number[]>;
  columnWidths: ComputedRef<number[]>;
  rowHeight: number;
}

export interface UseFillHandleResult {
  fillHandlePosition: ComputedRef<{ top: number; left: number } | null>;
}

/**
 * Composable for calculating the fill handle position.
 * The fill handle appears at the bottom-right corner of the selection
 * when all selected columns are editable.
 */
export function useFillHandle(options: UseFillHandleOptions): UseFillHandleResult {
  const { activeCell, selectionRange, slots, columns, visibleColumnsWithIndices, columnPositions, columnWidths, rowHeight } = options;

  const fillHandlePosition = computed(() => {
    const active = activeCell.value;
    const selection = selectionRange.value;
    const slotsMap = slots.value;

    if (!active && !selection) return null;

    let row: number, col: number;
    let minCol: number, maxCol: number;

    if (selection) {
      row = Math.max(selection.startRow, selection.endRow);
      col = Math.max(selection.startCol, selection.endCol);
      minCol = Math.min(selection.startCol, selection.endCol);
      maxCol = Math.max(selection.startCol, selection.endCol);
    } else if (active) {
      row = active.row;
      col = active.col;
      minCol = col;
      maxCol = col;
    } else {
      return null;
    }

    // Check if ALL columns in the selection are editable (skip hidden columns)
    const cols = columns.value;
    for (let c = minCol; c <= maxCol; c++) {
      const column = cols[c];
      if (!column || column.hidden) continue; // Skip hidden columns
      if (column.editable !== true) {
        return null;
      }
    }

    // Find the visible index for the target column
    const visibleIndex = visibleColumnsWithIndices.value.findIndex(
      (v) => v.originalIndex === col,
    );
    if (visibleIndex === -1) return null; // Column is hidden

    // Find the slot for this row and use its actual translateY
    let cellTop: number | null = null;
    for (const slot of slotsMap.values()) {
      if (slot.rowIndex === row) {
        cellTop = slot.translateY;
        break;
      }
    }

    if (cellTop === null) return null;

    const cellLeft = columnPositions.value[visibleIndex] ?? 0;
    const cellWidth = columnWidths.value[visibleIndex] ?? 0;

    return {
      top: cellTop + rowHeight - 5,
      left: cellLeft + cellWidth - 20,
    };
  });

  return { fillHandlePosition };
}
