// packages/react/src/hooks/useInputHandler.ts

import { useRef, useEffect, useCallback, useState } from "react";
import type {
  GridCore,
  CellPosition,
  CellRange,
  PointerEventData,
  ContainerBounds,
  DragState,
} from "@gp-grid/core";
import { scrollCellIntoView } from "@gp-grid/core";
import type { SlotData } from "../gridState/types";

// =============================================================================
// Types
// =============================================================================

export interface VisibleColumnInfo {
  column: { colId?: string; field: string };
  originalIndex: number;
}

export interface UseInputHandlerOptions {
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number } | null;
  filterPopupOpen: boolean;
  rowHeight: number;
  headerHeight: number;
  columnPositions: number[];
  /** Visible columns with their original indices (for hidden column support) */
  visibleColumnsWithIndices: VisibleColumnInfo[];
  slots: Map<string, SlotData>;
  rowsWrapperOffset: number;
}

export interface UseInputHandlerResult {
  // Event handlers
  handleCellMouseDown: (rowIndex: number, colIndex: number, e: React.PointerEvent) => void;
  handleCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  handleFillHandleMouseDown: (e: React.PointerEvent) => void;
  handleHeaderClick: (colIndex: number, e: React.MouseEvent) => void;
  handleHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: React.PointerEvent) => void;
  handleHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: React.PointerEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  handleWheel: (e: React.WheelEvent, wheelDampening: number) => void;
  // Drag state for UI rendering
  dragState: DragState;
}

// =============================================================================
// Constants
// =============================================================================

const AUTO_SCROLL_INTERVAL = 16; // ~60fps

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing all input handling using core's InputHandler
 */
export function useInputHandler<TData>(
  coreRef: React.RefObject<GridCore<TData> | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  columns: { colId?: string; field: string }[],
  options: UseInputHandlerOptions
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

  // Auto-scroll interval ref
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Store last mouse event for re-processing during auto-scroll
  const lastMouseEventRef = useRef<PointerEventData | null>(null);
  // Pending row drag timer (touch long-press)
  const rowDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending row drag capture info (for setPointerCapture on confirmation)
  const rowDragCaptureRef = useRef<{ pointerId: number; target: Element } | null>(null);
  // Scroll-lock: saved container overflow so we can restore it after row drag ends
  const savedContainerOverflowRef = useRef<string | null>(null);
  // Touchmove blocker — stable ref so addEventListener/removeEventListener use the same reference
  const blockTouchMove = useCallback((e: TouchEvent): void => { e.preventDefault(); }, []);

  // Drag state for UI (mirrors core's InputHandler state)
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: null,
    fillSourceRange: null,
    fillTarget: null,
    columnResize: null,
    columnMove: null,
    rowDrag: null,
  });

  // Update InputHandler deps when options change
  useEffect(() => {
    const core = coreRef.current;
    if (core?.input) {
      core.input.updateDeps({
        getHeaderHeight: () => headerHeight,
        getRowHeight: () => rowHeight,
        getColumnPositions: () => columnPositions,
        getColumnCount: () => visibleColumnsWithIndices.length,
        getOriginalColumnIndex: (visibleIndex: number) => {
          const info = visibleColumnsWithIndices[visibleIndex];
          return info ? info.originalIndex : visibleIndex;
        },
      });
    }
  }, [coreRef, headerHeight, rowHeight, columnPositions, visibleColumnsWithIndices]);

  // Get container bounds
  const getContainerBounds = useCallback((): ContainerBounds | null => {
    const container = containerRef.current;
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
  }, [containerRef]);

  // Auto-scroll helpers
  const startAutoScroll = useCallback((dx: number, dy: number) => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
    }
    autoScrollRef.current = setInterval(() => {
      const container = containerRef.current;
      const core = coreRef.current;
      if (container) {
        container.scrollTop += dy;
        container.scrollLeft += dx;

        // Re-process drag move with last known mouse position so the
        // drop target stays in sync as the grid scrolls
        const lastEvent = lastMouseEventRef.current;
        if (lastEvent && core?.input) {
          const bounds = getContainerBounds();
          if (bounds) {
            core.input.handleDragMove(lastEvent, bounds);
            setDragState(core.input.getDragState());
          }
        }
      }
    }, AUTO_SCROLL_INTERVAL);
  }, [containerRef, coreRef, getContainerBounds]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  // Convert pointer event to PointerEventData
  const toPointerEventData = (e: React.PointerEvent | PointerEvent): PointerEventData => ({
    clientX: e.clientX,
    clientY: e.clientY,
    button: e.button,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    pointerId: e.pointerId,
    pointerType: e.pointerType,
  });

  // ===========================================================================
  // Global Drag Listeners
  // ===========================================================================

  const startGlobalDragListeners = useCallback(() => {
    const handlePointerMove = (e: PointerEvent) => {
      // Prevent browser scroll/pan during any active drag
      e.preventDefault();

      const core = coreRef.current;
      const bounds = getContainerBounds();
      if (!core?.input || !bounds) return;

      const eventData = toPointerEventData(e);
      lastMouseEventRef.current = eventData;
      const result = core.input.handleDragMove(eventData, bounds);
      if (result) {
        if (result.autoScroll) {
          startAutoScroll(result.autoScroll.dx, result.autoScroll.dy);
        } else {
          stopAutoScroll();
        }
        // Update UI drag state
        setDragState(core.input.getDragState());
      }
    };

    const handlePointerUp = () => {
      const core = coreRef.current;
      if (core?.input) {
        core.input.handleDragEnd();
        setDragState(core.input.getDragState());
      }
      lastMouseEventRef.current = null;
      stopAutoScroll();
      // Restore scroll locks after row drag ends
      document.removeEventListener("touchmove", blockTouchMove);
      if (savedContainerOverflowRef.current !== null && containerRef.current) {
        containerRef.current.style.overflow = savedContainerOverflowRef.current;
        savedContainerOverflowRef.current = null;
      }
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };

    // { passive: false } is required so that preventDefault() works in handlePointerMove
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
  }, [coreRef, getContainerBounds, startAutoScroll, stopAutoScroll]);

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  const cancelPendingRowDrag = useCallback(() => {
    if (rowDragTimerRef.current !== null) {
      clearTimeout(rowDragTimerRef.current);
      rowDragTimerRef.current = null;
      coreRef.current?.input?.cancelPendingRowDrag();
    }
    rowDragCaptureRef.current = null;
  }, [coreRef]);

  const handleCellMouseDown = useCallback(
    (rowIndex: number, colIndex: number, e: React.PointerEvent) => {
      const core = coreRef.current;
      if (!core?.input) return;

      const result = core.input.handleCellMouseDown(
        rowIndex,
        colIndex,
        toPointerEventData(e)
      );

      if (result.focusContainer) {
        containerRef.current?.focus();
      }
      if (result.startDrag === "selection") {
        core.input.startSelectionDrag();
        setDragState(core.input.getDragState());
        startGlobalDragListeners();
      } else if (result.startDrag === "row-drag") {
        setDragState(core.input.getDragState());
        startGlobalDragListeners();
      } else if (result.startDrag === "row-drag-pending") {
        // Touch long-press: wait 300ms before activating row drag.
        // If the pointer moves (scroll), the pointermove handler cancels the timer.
        cancelPendingRowDrag();

        // Store capture info so we can setPointerCapture on confirmation
        rowDragCaptureRef.current = {
          pointerId: e.pointerId,
          target: e.currentTarget as Element,
        };

        const startX = e.clientX;
        const startY = e.clientY;

        // handlePendingMove and handlePendingUp call cleanup, which is declared
        // below. cleanup is initialized before these listeners ever fire.
        const handlePendingMove = (moveE: PointerEvent) => {
          const dx = moveE.clientX - startX;
          const dy = moveE.clientY - startY;
          // Allow up to 10px jitter — touch screens naturally move slightly
          // during a hold. Only cancel if the finger clearly moved to scroll.
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            cancelPendingRowDrag();
            cleanup();
          }
        };
        const handlePendingUp = () => {
          cancelPendingRowDrag();
          cleanup();
        };
        const cleanup = () => {
          document.removeEventListener("pointermove", handlePendingMove);
          document.removeEventListener("pointerup", handlePendingUp);
          document.removeEventListener("pointercancel", handlePendingUp);
        };

        document.addEventListener("pointermove", handlePendingMove);
        document.addEventListener("pointerup", handlePendingUp, { once: true });
        document.addEventListener("pointercancel", handlePendingUp, { once: true });

        rowDragTimerRef.current = setTimeout(() => {
          rowDragTimerRef.current = null;
          cleanup();

          const capture = rowDragCaptureRef.current;
          rowDragCaptureRef.current = null;

          if (core.input.confirmPendingRowDrag()) {
            // Lock both container and body so neither can momentum-scroll
            // while the row drag is active
            if (containerRef.current) {
              savedContainerOverflowRef.current = containerRef.current.style.overflow;
              containerRef.current.style.overflow = "hidden";
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
            setDragState(core.input.getDragState());
            startGlobalDragListeners();
          }
        }, 300);
      }
    },
    [coreRef, containerRef, startGlobalDragListeners, cancelPendingRowDrag]
  );

  const handleCellDoubleClick = useCallback(
    (rowIndex: number, colIndex: number) => {
      const core = coreRef.current;
      if (!core?.input) return;
      core.input.handleCellDoubleClick(rowIndex, colIndex);
    },
    [coreRef]
  );

  const handleFillHandleMouseDown = useCallback(
    (e: React.PointerEvent) => {
      const core = coreRef.current;
      if (!core?.input) return;

      const result = core.input.handleFillHandleMouseDown(
        activeCell,
        selectionRange,
        toPointerEventData(e)
      );

      if (result.preventDefault) e.preventDefault();
      if (result.stopPropagation) e.stopPropagation();
      if (result.startDrag === "fill") {
        try { (e.target as Element).setPointerCapture(e.pointerId); } catch (_) { /* pointer may have been released */ }
        setDragState(core.input.getDragState());
        startGlobalDragListeners();
      }
    },
    [coreRef, activeCell, selectionRange, startGlobalDragListeners]
  );

  const handleHeaderClick = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      const core = coreRef.current;
      if (!core?.input) return;

      const column = columns[colIndex];
      if (!column) return;

      const colId = column.colId ?? column.field;
      core.input.handleHeaderClick(colId, e.shiftKey);
    },
    [coreRef, columns]
  );

  const handleHeaderMouseDown = useCallback(
    (colIndex: number, colWidth: number, colHeight: number, e: React.PointerEvent) => {
      const core = coreRef.current;
      if (!core?.input) return;

      const result = core.input.handleHeaderMouseDown(
        colIndex,
        colWidth,
        colHeight,
        toPointerEventData(e)
      );

      if (result.preventDefault) e.preventDefault();
      if (result.stopPropagation) e.stopPropagation();
      if (result.startDrag === "column-move") {
        try { (e.target as Element).setPointerCapture(e.pointerId); } catch (_) { /* pointer may have been released */ }
        setDragState(core.input.getDragState());
        startGlobalDragListeners();
      }
    },
    [coreRef, startGlobalDragListeners]
  );

  const handleHeaderResizeMouseDown = useCallback(
    (colIndex: number, colWidth: number, e: React.PointerEvent) => {
      const core = coreRef.current;
      if (!core?.input) return;

      const result = core.input.handleHeaderResizeMouseDown(
        colIndex,
        colWidth,
        toPointerEventData(e)
      );

      if (result.preventDefault) e.preventDefault();
      if (result.stopPropagation) e.stopPropagation();
      if (result.startDrag === "column-resize") {
        setDragState(core.input.getDragState());
        startGlobalDragListeners();
      }
    },
    [coreRef, startGlobalDragListeners]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const core = coreRef.current;
      const container = containerRef.current;
      if (!core?.input) return;

      const result = core.input.handleKeyDown(
        {
          key: e.key,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        },
        activeCell,
        editingCell,
        filterPopupOpen
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
          slots,
          rowsWrapperOffset
        );
      }
    },
    [coreRef, containerRef, activeCell, editingCell, filterPopupOpen, rowHeight, slots, rowsWrapperOffset]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const core = coreRef.current;
      if (!core) return;
      if (editingCell !== null) return;
      if (filterPopupOpen) return;

      const text = e.clipboardData.getData("text/plain");
      if (core.pasteClipboardText(text)) {
        e.preventDefault();
      }
    },
    [coreRef, editingCell, filterPopupOpen]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent, wheelDampening: number) => {
      const core = coreRef.current;
      const container = containerRef.current;
      if (!core?.input || !container) return;

      const dampened = core.input.handleWheel(e.deltaY, e.deltaX, wheelDampening);
      if (dampened) {
        e.preventDefault();
        container.scrollTop += dampened.dy;
        container.scrollLeft += dampened.dx;
      }
    },
    [coreRef, containerRef]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
      cancelPendingRowDrag();
      // Release any lingering scroll locks
      document.removeEventListener("touchmove", blockTouchMove);
      if (savedContainerOverflowRef.current !== null && containerRef.current) {
        containerRef.current.style.overflow = savedContainerOverflowRef.current;
        savedContainerOverflowRef.current = null;
      }
    };
  }, [stopAutoScroll, cancelPendingRowDrag, blockTouchMove, containerRef]);

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
