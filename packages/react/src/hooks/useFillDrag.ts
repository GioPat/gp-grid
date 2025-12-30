// packages/react/src/hooks/useFillDrag.ts

import { useState, useEffect, useCallback, useRef } from "react";
import type { GridCore, Row, CellRange, CellPosition } from "gp-grid-core";
import { useAutoScroll } from "./useAutoScroll";
import { findColumnAtX } from "../utils/positioning";

export interface FillDragState {
  isDraggingFill: boolean;
  fillTarget: { row: number; col: number } | null;
  fillSourceRange: CellRange | null;
}

export interface UseFillDragResult extends FillDragState {
  handleFillHandleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing fill handle drag functionality
 */
export function useFillDrag<TData extends Row>(
  coreRef: React.RefObject<GridCore<TData> | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  activeCell: CellPosition | null,
  selectionRange: CellRange | null,
  totalHeaderHeight: number,
  columnPositions: number[],
): UseFillDragResult {
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [fillTarget, setFillTarget] = useState<{ row: number; col: number } | null>(null);
  const [fillSourceRange, setFillSourceRange] = useState<CellRange | null>(null);
  const { updateAutoScroll, stopAutoScroll } = useAutoScroll();

  const handleFillHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const core = coreRef.current;
      if (!core) return;

      if (!activeCell && !selectionRange) return;

      // Create source range from selection or active cell
      const sourceRange: CellRange = selectionRange ?? {
        startRow: activeCell!.row,
        startCol: activeCell!.col,
        endRow: activeCell!.row,
        endCol: activeCell!.col,
      };

      core.fill.startFillDrag(sourceRange);
      setFillSourceRange(sourceRange);
      setFillTarget({
        row: Math.max(sourceRange.startRow, sourceRange.endRow),
        col: Math.max(sourceRange.startCol, sourceRange.endCol),
      });
      setIsDraggingFill(true);
    },
    [coreRef, activeCell, selectionRange],
  );

  // Handle mouse move/up during fill drag
  useEffect(() => {
    if (!isDraggingFill) return;

    const handleMouseMove = (e: MouseEvent) => {
      const core = coreRef.current;
      const container = containerRef.current;
      if (!core || !container) return;

      // Get container bounds
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      // Calculate mouse position relative to grid content
      const mouseX = e.clientX - rect.left + scrollLeft;
      // Viewport-relative Y (physical pixels below header, NOT including scroll)
      const viewportY = e.clientY - rect.top - totalHeaderHeight;

      // Find the row under the mouse (core method handles scroll and scaling)
      const targetRow = Math.max(0, core.getRowIndexAtDisplayY(viewportY, scrollTop));

      // Find column by checking column positions
      const targetCol = findColumnAtX(mouseX, columnPositions);

      core.fill.updateFillDrag(targetRow, targetCol);
      setFillTarget({ row: targetRow, col: targetCol });

      // Auto-scroll logic
      const mouseYInContainer = e.clientY - rect.top;
      const mouseXInContainer = e.clientX - rect.left;
      updateAutoScroll(
        mouseYInContainer,
        mouseXInContainer,
        rect.height,
        rect.width,
        totalHeaderHeight,
        container,
      );
    };

    const handleMouseUp = () => {
      stopAutoScroll();

      const core = coreRef.current;
      if (core) {
        core.fill.commitFillDrag();
        // Refresh slots to show updated values
        core.refreshSlotData();
      }
      setIsDraggingFill(false);
      setFillTarget(null);
      setFillSourceRange(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      stopAutoScroll();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDraggingFill,
    coreRef,
    containerRef,
    totalHeaderHeight,
    columnPositions,
    updateAutoScroll,
    stopAutoScroll,
  ]);

  return {
    isDraggingFill,
    fillTarget,
    fillSourceRange,
    handleFillHandleMouseDown,
  };
}
