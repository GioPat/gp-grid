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
  CellPosition,
  CellRange,
  ColumnDefinition,
  PointerEventData,
  ContainerBounds,
  DragState,
  SlotData,
  VisibleColumnInfo,
} from "@gp-grid/core";
import { scrollCellIntoView } from "@gp-grid/core";
import { useAutoScroll } from "./useAutoScroll";

// Re-export for backwards compatibility
export type { VisibleColumnInfo } from "@gp-grid/core";

export interface UseInputHandlerOptions {
  activeCell: ComputedRef<CellPosition | null>;
  selectionRange: ComputedRef<CellRange | null>;
  editingCell: ComputedRef<{ row: number; col: number } | null>;
  filterPopupOpen: ComputedRef<boolean>;
  rowHeight: number;
  headerHeight: number;
  columnPositions: ComputedRef<number[]>;
  /** Visible columns with their original indices (for hidden column support) */
  visibleColumnsWithIndices: ComputedRef<VisibleColumnInfo[]>;
  slots: ComputedRef<Map<string, SlotData>>;
  rowsWrapperOffset: ComputedRef<number>;
}

export interface UseInputHandlerResult {
  handleCellMouseDown: (
    rowIndex: number,
    colIndex: number,
    e: PointerEvent,
  ) => void;
  handleCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  handleFillHandleMouseDown: (e: PointerEvent) => void;
  handleHeaderClick: (colIndex: number, e: MouseEvent) => void;
  handleHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: PointerEvent) => void;
  handleHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: PointerEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  handlePaste: (e: ClipboardEvent) => void;
  handleWheel: (e: WheelEvent, wheelDampening: number) => void;
  dragState: Ref<DragState>;
}

// =============================================================================
// Composable
// =============================================================================

/**
 * Vue composable for handling all input interactions
 */
export function useInputHandler<TData = unknown>(
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
    visibleColumnsWithIndices,
    slots,
    rowsWrapperOffset,
  } = options;

  // Drag state for UI (mirrors core's InputHandler state)
  const dragState = ref<DragState>({
    isDragging: false,
    dragType: null,
    fillSourceRange: null,
    fillTarget: null,
    columnResize: null,
    columnMove: null,
    rowDrag: null,
  });

  // Store last mouse event for re-processing during auto-scroll
  let lastMouseEvent: PointerEventData | null = null;

  // Cleanup function for current global drag listeners (prevents listener leaks)
  let cleanupGlobalListeners: (() => void) | null = null;

  // Pending row drag timer (touch long-press)
  let rowDragTimer: ReturnType<typeof setTimeout> | null = null;
  // Pending row drag capture info (for setPointerCapture on confirmation)
  let rowDragCapture: { pointerId: number; target: Element } | null = null;
  // Scroll-lock: saved container overflow so we can restore it after row drag ends
  let savedContainerOverflow: string | null = null;
  // Touchmove blocker — prevents in-flight iOS scroll gestures during row drag
  const blockTouchMove = (e: TouchEvent): void => { e.preventDefault(); };

  // Auto-scroll helpers — onTick re-processes drag so drop target stays in sync as the grid scrolls
  const { startAutoScroll, stopAutoScroll } = useAutoScroll(containerRef, () => {
    const core = coreRef.value;
    if (lastMouseEvent && core?.input) {
      const bounds = getContainerBounds();
      if (bounds) {
        core.input.handleDragMove(lastMouseEvent, bounds);
        dragState.value = core.input.getDragState();
      }
    }
  });

  // Update InputHandler deps when options change
  watch(
    [
      () => headerHeight,
      () => rowHeight,
      columnPositions,
      visibleColumnsWithIndices,
    ],
    () => {
      const core = coreRef.value;
      if (core?.input) {
        const visible = visibleColumnsWithIndices.value;
        core.input.updateDeps({
          getHeaderHeight: () => headerHeight,
          getRowHeight: () => rowHeight,
          getColumnPositions: () => columnPositions.value,
          getColumnCount: () => visible.length,
          getOriginalColumnIndex: (visibleIndex: number) => {
            const info = visible[visibleIndex];
            return info ? info.originalIndex : visibleIndex;
          },
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

  // Convert pointer event to PointerEventData
  function toPointerEventData(e: PointerEvent): PointerEventData {
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    };
  }

  // ===========================================================================
  // Global Drag Listeners
  // ===========================================================================

  function startGlobalDragListeners(): void {
    // Clean up any stale listeners from a previous drag (e.g., missed pointerup)
    cleanupGlobalListeners?.();

    const handlePointerMove = (e: PointerEvent): void => {
      // Prevent browser scroll/pan during any active drag
      e.preventDefault();

      const core = coreRef.value;
      const bounds = getContainerBounds();
      if (!core?.input || !bounds) return;

      const eventData = toPointerEventData(e);
      lastMouseEvent = eventData;

      const result = core.input.handleDragMove(eventData, bounds);
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

    const handlePointerUp = (): void => {
      try {
        const core = coreRef.value;
        if (core?.input) {
          core.input.handleDragEnd();
        }
      } finally {
        // Always reset drag state — even if handleDragEnd throws,
        // the ghost must disappear and listeners must be cleaned up.
        const core = coreRef.value;
        const newState = core?.input
          ? core.input.getDragState()
          : { isDragging: false, dragType: null, fillSourceRange: null, fillTarget: null, columnResize: null, columnMove: null, rowDrag: null };
        dragState.value = newState;
        lastMouseEvent = null;
        stopAutoScroll();
        // Restore scroll locks after row drag ends
        document.removeEventListener("touchmove", blockTouchMove);
        if (savedContainerOverflow !== null && containerRef.value) {
          containerRef.value.style.overflow = savedContainerOverflow;
          savedContainerOverflow = null;
        }
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.removeEventListener("pointercancel", handlePointerUp);
        cleanupGlobalListeners = null;
      }
    };

    // { passive: false } is required so that preventDefault() works in handlePointerMove
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);

    // Store cleanup so the next drag can remove stale listeners
    cleanupGlobalListeners = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  function cancelPendingRowDrag(): void {
    if (rowDragTimer !== null) {
      clearTimeout(rowDragTimer);
      rowDragTimer = null;
      coreRef.value?.input?.cancelPendingRowDrag();
    }
    rowDragCapture = null;
  }

  function handleCellMouseDown(
    rowIndex: number,
    colIndex: number,
    e: PointerEvent,
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
    } else if (result.startDrag === "row-drag") {
      dragState.value = core.input.getDragState();
      startGlobalDragListeners();
    } else if (result.startDrag === "row-drag-pending") {
      // Touch long-press: wait 300ms before activating row drag.
      cancelPendingRowDrag();

      // Store capture info so we can setPointerCapture on confirmation
      rowDragCapture = { pointerId: e.pointerId, target: (e.currentTarget ?? e.target) as Element };

      const startX = e.clientX;
      const startY = e.clientY;

      // handlePendingMove and handlePendingUp call cleanup, which is declared
      // below. cleanup is initialized before these listeners ever fire.
      const handlePendingMove = (moveE: PointerEvent): void => {
        const dx = moveE.clientX - startX;
        const dy = moveE.clientY - startY;
        // Allow up to 10px jitter — touch screens naturally move slightly
        // during a hold. Only cancel if the finger clearly moved to scroll.
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          cancelPendingRowDrag();
          cleanup();
        }
      };
      const handlePendingUp = (): void => {
        cancelPendingRowDrag();
        cleanup();
      };
      const cleanup = (): void => {
        document.removeEventListener("pointermove", handlePendingMove);
        document.removeEventListener("pointerup", handlePendingUp);
        document.removeEventListener("pointercancel", handlePendingUp);
      };

      document.addEventListener("pointermove", handlePendingMove);
      document.addEventListener("pointerup", handlePendingUp, { once: true });
      document.addEventListener("pointercancel", handlePendingUp, { once: true });

      rowDragTimer = setTimeout(() => {
        rowDragTimer = null;
        cleanup();

        const capture = rowDragCapture;
        rowDragCapture = null;

        if (core.input.confirmPendingRowDrag()) {
          // Lock both container and body so neither can momentum-scroll
          // while the row drag is active
          if (containerRef.value) {
            savedContainerOverflow = containerRef.value.style.overflow;
            containerRef.value.style.overflow = "hidden";
          }
          // Also block touchmove at document level — on iOS this stops
          // any in-flight scroll gesture that started during the hold window
          document.addEventListener("touchmove", blockTouchMove, { passive: false });
          // Capture the pointer so the browser stops scrolling and routes
          // all future pointer events through our drag handler
          if (capture) {
            try {
              capture.target.setPointerCapture(capture.pointerId);
            } catch (_) {
              // Pointer may have already been released
            }
          }
          dragState.value = core.input.getDragState();
          startGlobalDragListeners();
        }
      }, 300);
    }
  }

  function handleCellDoubleClick(rowIndex: number, colIndex: number): void {
    const core = coreRef.value;
    if (!core?.input) return;
    core.input.handleCellDoubleClick(rowIndex, colIndex);
  }

  function handleFillHandleMouseDown(e: PointerEvent): void {
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
      try { (e.target as Element).setPointerCapture(e.pointerId); } catch (_) { /* pointer may have been released */ }
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

  function handleHeaderMouseDown(
    colIndex: number,
    colWidth: number,
    colHeight: number,
    e: PointerEvent,
  ): void {
    const core = coreRef.value;
    if (!core?.input) return;

    const result = core.input.handleHeaderMouseDown(
      colIndex,
      colWidth,
      colHeight,
      toPointerEventData(e),
    );

    if (result.preventDefault) e.preventDefault();
    if (result.stopPropagation) e.stopPropagation();
    if (result.startDrag === "column-move") {
      try { (e.target as Element).setPointerCapture(e.pointerId); } catch (_) { /* pointer may have been released */ }
      dragState.value = core.input.getDragState();
      startGlobalDragListeners();
    }
  }

  function handleHeaderResizeMouseDown(
    colIndex: number,
    colWidth: number,
    e: PointerEvent,
  ): void {
    const core = coreRef.value;
    if (!core?.input) return;

    const result = core.input.handleHeaderResizeMouseDown(
      colIndex,
      colWidth,
      toPointerEventData(e),
    );

    if (result.preventDefault) e.preventDefault();
    if (result.stopPropagation) e.stopPropagation();
    if (result.startDrag === "column-resize") {
      dragState.value = core.input.getDragState();
      startGlobalDragListeners();
    }
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
        slots.value,
        rowsWrapperOffset.value,
      );
    }
  }

  function handlePaste(e: ClipboardEvent): void {
    const core = coreRef.value;
    if (core === null) return;
    if (editingCell.value !== null) return;
    if (filterPopupOpen.value) return;

    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (core.pasteClipboardText(text)) {
      e.preventDefault();
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
    cleanupGlobalListeners?.();
    cleanupGlobalListeners = null;
    cancelPendingRowDrag();
    stopAutoScroll();
    // Release any lingering scroll locks
    document.removeEventListener("touchmove", blockTouchMove);
    if (savedContainerOverflow !== null && containerRef.value) {
      containerRef.value.style.overflow = savedContainerOverflow;
      savedContainerOverflow = null;
    }
  });

  return {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderClick,
    handleHeaderMouseDown,
    handleHeaderResizeMouseDown,
    handleKeyDown,
    handlePaste,
    handleWheel,
    dragState,
  };
}
