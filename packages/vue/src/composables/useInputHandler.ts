// packages/vue/src/composables/useInputHandler.ts

import {
  ref,
  watch,
  onUnmounted,
  type Ref,
  type ShallowRef,
  type ComputedRef,
} from "vue";
import type {
  GridCore,
  Row,
  CellPosition,
  CellRange,
  PointerEventData,
  ContainerBounds,
  DragState,
  ColumnDefinition,
  SlotData,
} from "gp-grid-core";
import { useAutoScroll } from "./useAutoScroll";

// =============================================================================
// Types
// =============================================================================

export interface UseInputHandlerOptions {
  activeCell: ComputedRef<CellPosition | null>;
  selectionRange: ComputedRef<CellRange | null>;
  editingCell: ComputedRef<{ row: number; col: number } | null>;
  filterPopupOpen: ComputedRef<boolean>;
  rowHeight: number;
  headerHeight: number;
  columnPositions: ComputedRef<number[]>;
  slots: ComputedRef<Map<string, SlotData>>;
}

export interface UseInputHandlerResult {
  handleCellMouseDown: (
    rowIndex: number,
    colIndex: number,
    e: MouseEvent,
  ) => void;
  handleCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  handleFillHandleMouseDown: (e: MouseEvent) => void;
  handleHeaderClick: (colIndex: number, e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  handleWheel: (e: WheelEvent, wheelDampening: number) => void;
  dragState: Ref<DragState>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find the slot for a given row index
 */
function findSlotForRow(
  slots: Map<string, SlotData>,
  rowIndex: number,
): SlotData | null {
  for (const slot of slots.values()) {
    if (slot.rowIndex === rowIndex) {
      return slot;
    }
  }
  return null;
}

/**
 * Scroll a cell into view if needed
 */
function scrollCellIntoView(
  core: GridCore,
  container: HTMLDivElement,
  row: number,
  rowHeight: number,
  headerHeight: number,
  slots: Map<string, SlotData>,
): void {
  const slot = findSlotForRow(slots, row);
  const cellTranslateY = slot
    ? slot.translateY
    : headerHeight + row * rowHeight;
  const cellViewportTop = cellTranslateY - container.scrollTop;
  const cellViewportBottom = cellViewportTop + rowHeight;
  const visibleTop = headerHeight;
  const visibleBottom = container.clientHeight;

  if (cellViewportTop < visibleTop) {
    container.scrollTop = core.getScrollTopForRow(row);
  } else if (cellViewportBottom > visibleBottom) {
    const visibleDataHeight = container.clientHeight - headerHeight;
    const rowsInView = Math.floor(visibleDataHeight / rowHeight);
    const targetRow = Math.max(0, row - rowsInView + 1);
    container.scrollTop = core.getScrollTopForRow(targetRow);
  }
}

// =============================================================================
// Composable
// =============================================================================

/**
 * Vue composable for handling all input interactions
 */
export function useInputHandler<TData extends Row = Row>(
  coreRef: ShallowRef<GridCore<TData> | null>,
  containerRef: Ref<HTMLDivElement | null>,
  columns: ComputedRef<ColumnDefinition[]>,
  options: UseInputHandlerOptions,
): UseInputHandlerResult {
  const {
    activeCell,
    selectionRange,
    editingCell,
    filterPopupOpen,
    rowHeight,
    headerHeight,
    columnPositions,
    slots,
  } = options;

  // Auto-scroll helpers
  const { startAutoScroll, stopAutoScroll } = useAutoScroll(containerRef);

  // Drag state for UI (mirrors core's InputHandler state)
  const dragState = ref<DragState>({
    isDragging: false,
    dragType: null,
    fillSourceRange: null,
    fillTarget: null,
  });

  // Update InputHandler deps when options change
  watch(
    [
      () => headerHeight,
      () => rowHeight,
      columnPositions,
      () => columns.value.length,
    ],
    () => {
      const core = coreRef.value;
      if (core?.input) {
        core.input.updateDeps({
          getHeaderHeight: () => headerHeight,
          getRowHeight: () => rowHeight,
          getColumnPositions: () => columnPositions.value,
          getColumnCount: () => columns.value.length,
        });
      }
    },
    { immediate: true },
  );

  // Get container bounds
  function getContainerBounds(): ContainerBounds | null {
    const container = containerRef.value;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft,
    };
  }

  // Convert mouse event to PointerEventData
  function toPointerEventData(e: MouseEvent): PointerEventData {
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    };
  }

  // ===========================================================================
  // Global Drag Listeners
  // ===========================================================================

  function startGlobalDragListeners(): void {
    const handleMouseMove = (e: MouseEvent): void => {
      const core = coreRef.value;
      const bounds = getContainerBounds();
      if (!core?.input || !bounds) return;

      const result = core.input.handleDragMove(toPointerEventData(e), bounds);
      if (result) {
        if (result.autoScroll) {
          startAutoScroll(result.autoScroll.dx, result.autoScroll.dy);
        } else {
          stopAutoScroll();
        }
        // Update UI drag state
        dragState.value = core.input.getDragState();
      }
    };

    const handleMouseUp = (): void => {
      const core = coreRef.value;
      if (core?.input) {
        core.input.handleDragEnd();
        dragState.value = core.input.getDragState();
      }
      stopAutoScroll();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  function handleCellMouseDown(
    rowIndex: number,
    colIndex: number,
    e: MouseEvent,
  ): void {
    const core = coreRef.value;
    if (!core?.input) return;

    const result = core.input.handleCellMouseDown(
      rowIndex,
      colIndex,
      toPointerEventData(e),
    );

    if (result.focusContainer) {
      containerRef.value?.focus();
    }
    if (result.startDrag === "selection") {
      core.input.startSelectionDrag();
      dragState.value = core.input.getDragState();
      startGlobalDragListeners();
    }
  }

  function handleCellDoubleClick(rowIndex: number, colIndex: number): void {
    const core = coreRef.value;
    if (!core?.input) return;
    core.input.handleCellDoubleClick(rowIndex, colIndex);
  }

  function handleFillHandleMouseDown(e: MouseEvent): void {
    const core = coreRef.value;
    if (!core?.input) return;

    const result = core.input.handleFillHandleMouseDown(
      activeCell.value,
      selectionRange.value,
      toPointerEventData(e),
    );

    if (result.preventDefault) e.preventDefault();
    if (result.stopPropagation) e.stopPropagation();
    if (result.startDrag === "fill") {
      dragState.value = core.input.getDragState();
      startGlobalDragListeners();
    }
  }

  function handleHeaderClick(colIndex: number, e: MouseEvent): void {
    const core = coreRef.value;
    if (!core?.input) return;

    const column = columns.value[colIndex];
    if (!column) return;

    const colId = column.colId ?? column.field;
    core.input.handleHeaderClick(colId, e.shiftKey);
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const core = coreRef.value;
    const container = containerRef.value;
    if (!core?.input) return;

    const result = core.input.handleKeyDown(
      {
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
      },
      activeCell.value,
      editingCell.value,
      filterPopupOpen.value,
    );

    if (result.preventDefault) {
      e.preventDefault();
    }
    if (result.scrollToCell && container) {
      scrollCellIntoView(
        core,
        container,
        result.scrollToCell.row,
        rowHeight,
        headerHeight,
        slots.value,
      );
    }
  }

  function handleWheel(e: WheelEvent, wheelDampening: number): void {
    const core = coreRef.value;
    const container = containerRef.value;
    if (!core?.input || !container) return;

    const dampened = core.input.handleWheel(e.deltaY, e.deltaX, wheelDampening);
    if (dampened) {
      e.preventDefault();
      container.scrollTop += dampened.dy;
      container.scrollLeft += dampened.dx;
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopAutoScroll();
  });

  return {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderClick,
    handleKeyDown,
    handleWheel,
    dragState,
  };
}
