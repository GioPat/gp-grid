// packages/react/src/hooks/useSelectionDrag.ts

import { useState, useEffect, useCallback } from "react";
import type { GridCore, Row } from "gp-grid-core";
import { useAutoScroll } from "./useAutoScroll";
import { findColumnAtX } from "../utils/positioning";

export interface UseSelectionDragResult {
  isDraggingSelection: boolean;
  startSelectionDrag: () => void;
}

/**
 * Hook for managing selection drag functionality
 */
export function useSelectionDrag<TData extends Row>(
  coreRef: React.RefObject<GridCore<TData> | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  totalHeaderHeight: number,
  columnPositions: number[],
  columnsLength: number,
): UseSelectionDragResult {
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const { updateAutoScroll, stopAutoScroll } = useAutoScroll();

  const startSelectionDrag = useCallback(() => {
    setIsDraggingSelection(true);
  }, []);

  // Handle mouse move/up during selection drag
  useEffect(() => {
    if (!isDraggingSelection) return;

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
      const targetRow = Math.max(
        0,
        Math.min(
          core.getRowIndexAtDisplayY(viewportY, scrollTop),
          core.getRowCount() - 1,
        ),
      );

      // Find column by checking column positions
      let targetCol = findColumnAtX(mouseX, columnPositions);
      targetCol = Math.max(0, Math.min(targetCol, columnsLength - 1));

      // Extend selection to target cell (like shift+click)
      core.selection.startSelection(
        { row: targetRow, col: targetCol },
        { shift: true },
      );

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
      setIsDraggingSelection(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      stopAutoScroll();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDraggingSelection,
    coreRef,
    containerRef,
    totalHeaderHeight,
    columnPositions,
    columnsLength,
    updateAutoScroll,
    stopAutoScroll,
  ]);

  return {
    isDraggingSelection,
    startSelectionDrag,
  };
}
