// packages/react/src/hooks/useKeyboardNavigation.ts

import { useCallback } from "react";
import type {
  GridCore,
  Row,
  CellPosition,
  CellValue,
  Direction,
} from "gp-grid-core";

export interface KeyboardNavigationDeps {
  activeCell: CellPosition | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  filterPopupOpen: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  rowHeight: number;
  headerHeight: number;
}

/**
 * Scroll a cell into view if needed.
 * Uses the core's visible range to determine if scrolling is necessary.
 */
function scrollCellIntoView<TData extends Row>(
  core: GridCore<TData>,
  container: HTMLDivElement,
  row: number,
  rowHeight: number,
  headerHeight: number,
): void {
  // Get the visible row range from core (excludes overscan)
  const { start, end } = core.getVisibleRowRange();

  if (row < start) {
    // Row is above visible range - scroll up to bring it to the top
    container.scrollTop = core.getScrollTopForRow(row);
  } else if (row > end) {
    // Row is below visible range - scroll down to bring it to the bottom
    const rowsInView = Math.floor(
      (container.clientHeight - headerHeight) / rowHeight,
    );
    const targetRow = Math.max(0, row - rowsInView + 1);
    container.scrollTop = core.getScrollTopForRow(targetRow);
  }
  // Row is already in visible range - no scroll needed
}

/**
 * Hook for managing keyboard navigation in the grid
 */
export function useKeyboardNavigation<TData extends Row>(
  coreRef: React.RefObject<GridCore<TData> | null>,
  deps: KeyboardNavigationDeps,
): (e: React.KeyboardEvent) => void {
  const {
    activeCell,
    editingCell,
    filterPopupOpen,
    containerRef,
    rowHeight,
    headerHeight,
  } = deps;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const core = coreRef.current;
      const container = containerRef.current;
      if (!core) return;

      // Don't handle keyboard events when filter popup is open
      if (filterPopupOpen) {
        return;
      }

      // Don't handle keyboard events when editing (except special keys)
      if (
        editingCell &&
        e.key !== "Enter" &&
        e.key !== "Escape" &&
        e.key !== "Tab"
      ) {
        return;
      }

      const { selection } = core;
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      // Helper to handle arrow navigation with scroll-into-view
      const handleArrowKey = (direction: Direction) => {
        e.preventDefault();
        selection.moveFocus(direction, isShift);

        // Scroll the new active cell into view if needed
        const newActiveCell = selection.getActiveCell();
        if (newActiveCell && container) {
          scrollCellIntoView(
            core,
            container,
            newActiveCell.row,
            rowHeight,
            headerHeight,
          );
        }
      };

      switch (e.key) {
        case "ArrowUp":
          handleArrowKey("up");
          break;
        case "ArrowDown":
          handleArrowKey("down");
          break;
        case "ArrowLeft":
          handleArrowKey("left");
          break;
        case "ArrowRight":
          handleArrowKey("right");
          break;
        case "Enter":
          e.preventDefault();
          if (editingCell) {
            core.commitEdit();
          } else if (activeCell) {
            core.startEdit(activeCell.row, activeCell.col);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (editingCell) {
            core.cancelEdit();
          } else {
            selection.clearSelection();
          }
          break;
        case "Tab":
          e.preventDefault();
          if (editingCell) {
            core.commitEdit();
          }
          selection.moveFocus(isShift ? "left" : "right", false);
          break;
        case "a":
          if (isCtrl) {
            e.preventDefault();
            selection.selectAll();
          }
          break;
        case "c":
          if (isCtrl) {
            e.preventDefault();
            selection.copySelectionToClipboard();
          }
          break;
        case "F2":
          e.preventDefault();
          if (activeCell && !editingCell) {
            core.startEdit(activeCell.row, activeCell.col);
          }
          break;
        case "Delete":
        case "Backspace":
          // Start editing with empty value on delete/backspace
          if (activeCell && !editingCell) {
            e.preventDefault();
            core.startEdit(activeCell.row, activeCell.col);
          }
          break;
        default:
          // Start editing on any printable character
          if (activeCell && !editingCell && !isCtrl && e.key.length === 1) {
            core.startEdit(activeCell.row, activeCell.col);
          }
          break;
      }
    },
    [
      coreRef,
      containerRef,
      activeCell,
      editingCell,
      filterPopupOpen,
      rowHeight,
      headerHeight,
    ],
  );

  return handleKeyDown;
}
