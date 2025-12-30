// packages/react/src/hooks/useKeyboardNavigation.ts

import { useCallback } from "react";
import type {
  GridCore,
  Row,
  CellPosition,
  CellValue,
  Direction,
} from "gp-grid-core";
import type { SlotData } from "../gridState/types";

export interface KeyboardNavigationDeps {
  activeCell: CellPosition | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  filterPopupOpen: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  rowHeight: number;
  headerHeight: number;
  slots: Map<string, SlotData>;
}

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
 * Scroll a cell into view if needed.
 * Uses the actual slot translateY to determine if the cell is visible.
 */
function scrollCellIntoView<TData extends Row>(
  core: GridCore<TData>,
  container: HTMLDivElement,
  row: number,
  rowHeight: number,
  headerHeight: number,
  slots: Map<string, SlotData>,
): void {
  // Find the slot for this row to get its actual translateY
  const slot = findSlotForRow(slots, row);

  // If no slot found, the row isn't rendered yet - use calculated position as fallback
  const cellTranslateY = slot ? slot.translateY : (headerHeight + row * rowHeight);

  // Cell's viewport position = translateY - scrollTop
  const cellViewportTop = cellTranslateY - container.scrollTop;
  const cellViewportBottom = cellViewportTop + rowHeight;

  // Visible data area in viewport coordinates (below sticky header)
  const visibleTop = headerHeight;
  const visibleBottom = container.clientHeight;

  // Check if cell is fully visible in viewport
  if (cellViewportTop < visibleTop) {
    // Cell top is behind the sticky header - scroll up
    container.scrollTop = core.getScrollTopForRow(row);
  } else if (cellViewportBottom > visibleBottom) {
    // Cell bottom is below visible area - scroll down
    const visibleDataHeight = container.clientHeight - headerHeight;
    const rowsInView = Math.floor(visibleDataHeight / rowHeight);
    const targetRow = Math.max(0, row - rowsInView + 1);
    container.scrollTop = core.getScrollTopForRow(targetRow);
  }
  // Otherwise cell is fully visible - no scroll needed
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
    slots,
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
            slots,
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
      slots,
    ],
  );

  return handleKeyDown;
}
