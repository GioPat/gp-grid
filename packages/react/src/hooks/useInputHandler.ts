// packages/react/src/hooks/useInputHandler.ts

import { useRef, useEffect, useCallback, useState } from "react";
import type {
  GridCore,
  Row,
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
}

export interface UseInputHandlerResult {
  // Event handlers
  handleCellMouseDown: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  handleCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  handleFillHandleMouseDown: (e: React.MouseEvent) => void;
  handleHeaderClick: (colIndex: number, e: React.MouseEvent) => void;
  handleHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: React.MouseEvent) => void;
  handleHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: React.MouseEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
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
export function useInputHandler<TData extends Row>(
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
  } = options;

  // Auto-scroll interval ref
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Store last mouse event for re-processing during auto-scroll
  const lastMouseEventRef = useRef<PointerEventData | null>(null);

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

  // Convert React mouse event to PointerEventData
  const toPointerEventData = (e: React.MouseEvent | MouseEvent): PointerEventData => ({
    clientX: e.clientX,
    clientY: e.clientY,
    button: e.button,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
  });

  // ===========================================================================
  // Global Drag Listeners
  // ===========================================================================

  const startGlobalDragListeners = useCallback(() => {
    const handleMouseMove = (e: MouseEvent) => {
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

    const handleMouseUp = () => {
      const core = coreRef.current;
      if (core?.input) {
        core.input.handleDragEnd();
        setDragState(core.input.getDragState());
      }
      lastMouseEventRef.current = null;
      stopAutoScroll();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [coreRef, getContainerBounds, startAutoScroll, stopAutoScroll]);

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  const handleCellMouseDown = useCallback(
    (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
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
      }
    },
    [coreRef, containerRef, startGlobalDragListeners]
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
    (e: React.MouseEvent) => {
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
    (colIndex: number, colWidth: number, colHeight: number, e: React.MouseEvent) => {
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
        setDragState(core.input.getDragState());
        startGlobalDragListeners();
      }
    },
    [coreRef, startGlobalDragListeners]
  );

  const handleHeaderResizeMouseDown = useCallback(
    (colIndex: number, colWidth: number, e: React.MouseEvent) => {
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
          headerHeight,
          slots
        );
      }
    },
    [coreRef, containerRef, activeCell, editingCell, filterPopupOpen, rowHeight, headerHeight, slots]
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

  // Cleanup auto-scroll on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  return {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderClick,
    handleHeaderMouseDown,
    handleHeaderResizeMouseDown,
    handleKeyDown,
    handleWheel,
    dragState,
  };
}
