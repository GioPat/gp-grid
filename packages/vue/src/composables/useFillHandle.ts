import { computed, type ComputedRef, type ShallowRef } from "vue";
import type {
  CellPosition,
  CellRange,
  FillHandlePosition,
  GridCore,
  SlotData,
} from "@gp-grid/core";
import { calculateFillHandlePosition } from "@gp-grid/core";

export interface UseFillHandleOptions<TData = unknown> {
  coreRef: ShallowRef<GridCore<TData> | null>;
  activeCell: ComputedRef<CellPosition | null>;
  selectionRange: ComputedRef<CellRange | null>;
  /** Replaced on every batch: row recycling and scrolling move the handle. */
  slots: ComputedRef<Map<string, SlotData>>;
  /** Bumps when the committed geometry revision changes. */
  geometryRevision: ComputedRef<number>;
}

export interface UseFillHandleResult {
  fillHandlePosition: ComputedRef<FillHandlePosition | null>;
}

/**
 * Fill handle position, resolved by core geometry in rows-wrapper space.
 */
export const useFillHandle = <TData = unknown>(
  options: UseFillHandleOptions<TData>,
): UseFillHandleResult => {
  const { coreRef, activeCell, selectionRange, slots, geometryRevision } = options;

  const fillHandlePosition = computed(() => {
    void slots.value;
    void geometryRevision.value;
    const core = coreRef.value;
    if (core === null) return null;
    return calculateFillHandlePosition({
      core,
      activeCell: activeCell.value,
      selectionRange: selectionRange.value,
    });
  });

  return { fillHandlePosition };
};
