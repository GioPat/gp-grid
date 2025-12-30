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
} from "gp-grid-core";
import type { SlotData } from "../gridState/types";

// =============================================================================
// Types
// =============================================================================

export interface UseInputHandlerOptions {
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number } | null;
  filterPopupOpen: boolean;
  rowHeight: number;
  headerHeight: number;
  columnPositions: number[];
  slots: Map<string, SlotData>;
}

export interface UseInputHandlerResult {
  // Event handlers
  handleCellMouseDown: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  handleCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  handleFillHandleMouseDown: (e: React.MouseEvent) => void;
  handleHeaderClick: (colIndex: number, e: React.MouseEvent) => void;
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
// Helper Functions
// =============================================================================

/**
 * Find the slot for a given row index
 */
function findSlotForRow(slots: Map<string, SlotData>, rowIndex: number): SlotData | null {
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
function scrollCellIntoView<TData extends Row>(
  core: GridCore<TData>,
  container: HTMLDivElement,
  row: number,
  rowHeight: number,
  headerHeight: number,
  slots: Map<string, SlotData>
): void {
  const slot = findSlotForRow(slots, row);
  const cellTranslateY = slot ? slot.translateY : headerHeight + row * rowHeight;
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
    slots,
  } = options;

  // Auto-scroll interval ref
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drag state for UI (mirrors core's InputHandler state)
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: null,
    fillSourceRange: null,
    fillTarget: null,
  });

  // Update InputHandler deps when options change
  useEffect(() => {
    const core = coreRef.current;
    if (core?.input) {
      core.input.updateDeps({
        getHeaderHeight: () => headerHeight,
        getRowHeight: () => rowHeight,
        getColumnPositions: () => columnPositions,
        getColumnCount: () => columns.length,
      });
    }
  }, [coreRef, headerHeight, rowHeight, columnPositions, columns.length]);

  // Auto-scroll helpers
  const startAutoScroll = useCallback((dx: number, dy: number) => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
    }
    autoScrollRef.current = setInterval(() => {
      const container = containerRef.current;
      if (container) {
        container.scrollTop += dy;
        container.scrollLeft += dx;
      }
    }, AUTO_SCROLL_INTERVAL);
  }, [containerRef]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

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

      const result = core.input.handleDragMove(toPointerEventData(e), bounds);
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
    handleKeyDown,
    handleWheel,
    dragState,
  };
}
