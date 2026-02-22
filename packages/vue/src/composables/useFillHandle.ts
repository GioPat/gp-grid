// packages/vue/src/composables/useFillHandle.ts

import { computed, type ComputedRef } from "vue";
import type { CellPosition, CellRange, ColumnDefinition, SlotData } from "@gp-grid/core";
import { calculateFillHandlePosition, type VisibleColumnInfo, type FillHandlePosition } from "@gp-grid/core";

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
  fillHandlePosition: ComputedRef<FillHandlePosition | null>;
}

/**
 * Composable for calculating the fill handle position.
 * The fill handle appears at the bottom-right corner of the selection
 * when all selected columns are editable.
 */
export const useFillHandle = (options: UseFillHandleOptions): UseFillHandleResult => {
  const { activeCell, selectionRange, slots, columns, visibleColumnsWithIndices, columnPositions, columnWidths, rowHeight } = options;

  const fillHandlePosition = computed(() =>
    calculateFillHandlePosition({
      activeCell: activeCell.value,
      selectionRange: selectionRange.value,
      slots: slots.value,
      columns: columns.value,
      visibleColumnsWithIndices: visibleColumnsWithIndices.value,
      columnPositions: columnPositions.value,
      columnWidths: columnWidths.value,
      rowHeight,
    }),
  );

  return { fillHandlePosition };
};
