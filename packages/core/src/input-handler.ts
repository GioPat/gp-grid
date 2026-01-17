// packages/core/src/input-handler.ts
// Framework-agnostic input handler containing all input business logic

import type { GridCore } from "./grid-core";
import type { Row, CellPosition, CellRange } from "./types";
import type {
  PointerEventData,
  KeyEventData,
  ContainerBounds,
  InputResult,
  KeyboardResult,
  DragMoveResult,
  InputHandlerDeps,
  DragState,
} from "./types/input";
import type { Direction } from "./selection";
import { findColumnAtX } from "./utils";

// =============================================================================
// Constants
// =============================================================================

const AUTO_SCROLL_THRESHOLD = 40;
const AUTO_SCROLL_SPEED = 10;

// =============================================================================
// InputHandler Class
// =============================================================================

export class InputHandler<TData extends Row = Row> {
  private core: GridCore<TData>;
  private deps: InputHandlerDeps;

  // Drag state
  private isDraggingSelection = false;
  private isDraggingFill = false;
  private fillSourceRange: CellRange | null = null;
  private fillTarget: { row: number; col: number } | null = null;

  constructor(core: GridCore<TData>, deps: InputHandlerDeps) {
    this.core = core;
    this.deps = deps;
  }

  /**
   * Update dependencies (called when options change)
   */
  updateDeps(deps: Partial<InputHandlerDeps>): void {
    this.deps = { ...this.deps, ...deps };
  }

  // ===========================================================================
  // State Accessors (for UI rendering)
  // ===========================================================================

  /**
   * Get current drag state for UI rendering
   */
  getDragState(): DragState {
    return {
      isDragging: this.isDraggingSelection || this.isDraggingFill,
      dragType: this.isDraggingFill
        ? "fill"
        : this.isDraggingSelection
          ? "selection"
          : null,
      fillSourceRange: this.fillSourceRange,
      fillTarget: this.fillTarget,
    };
  }

  // ===========================================================================
  // Cell Mouse Down
  // ===========================================================================

  /**
   * Handle cell mouse down event
   */
  handleCellMouseDown(
    rowIndex: number,
    colIndex: number,
    event: PointerEventData
  ): InputResult {
    // Only handle left mouse button
    if (event.button !== 0) {
      return { preventDefault: false, stopPropagation: false };
    }

    // Don't start selection while editing
    if (this.core.getEditState() !== null) {
      return { preventDefault: false, stopPropagation: false };
    }

    this.core.selection.startSelection(
      { row: rowIndex, col: colIndex },
      { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey }
    );

    return {
      preventDefault: false,
      stopPropagation: false,
      focusContainer: true,
      startDrag: event.shiftKey ? undefined : "selection",
    };
  }

  /**
   * Handle cell double click event (start editing)
   */
  handleCellDoubleClick(rowIndex: number, colIndex: number): void {
    this.core.startEdit(rowIndex, colIndex);
  }

  // ===========================================================================
  // Hover Tracking (for highlighting)
  // ===========================================================================

  /**
   * Handle cell mouse enter event (for hover highlighting)
   */
  handleCellMouseEnter(rowIndex: number, colIndex: number): void {
    this.core.highlight?.setHoverPosition({ row: rowIndex, col: colIndex });
  }

  /**
   * Handle cell mouse leave event (for hover highlighting)
   */
  handleCellMouseLeave(): void {
    this.core.highlight?.setHoverPosition(null);
  }

  // ===========================================================================
  // Fill Handle Mouse Down
  // ===========================================================================

  /**
   * Handle fill handle mouse down event
   */
  handleFillHandleMouseDown(
    activeCell: CellPosition | null,
    selectionRange: CellRange | null,
    _event: PointerEventData
  ): InputResult {
    if (!activeCell && !selectionRange) {
      return { preventDefault: false, stopPropagation: false };
    }

    // Create source range from selection or active cell
    const sourceRange: CellRange = selectionRange ?? {
      startRow: activeCell!.row,
      startCol: activeCell!.col,
      endRow: activeCell!.row,
      endCol: activeCell!.col,
    };

    this.core.fill.startFillDrag(sourceRange);
    this.fillSourceRange = sourceRange;
    this.fillTarget = {
      row: Math.max(sourceRange.startRow, sourceRange.endRow),
      col: Math.max(sourceRange.startCol, sourceRange.endCol),
    };
    this.isDraggingFill = true;

    return {
      preventDefault: true,
      stopPropagation: true,
      startDrag: "fill",
    };
  }

  // ===========================================================================
  // Header Click
  // ===========================================================================

  /**
   * Handle header click event (cycle sort direction)
   */
  handleHeaderClick(colId: string, addToExisting: boolean): void {
    const currentDirection = this.core
      .getSortModel()
      .find((s) => s.colId === colId)?.direction;

    const nextDirection =
      currentDirection === undefined || currentDirection === null
        ? "asc"
        : currentDirection === "asc"
          ? "desc"
          : null;

    this.core.setSort(colId, nextDirection, addToExisting);
  }

  // ===========================================================================
  // Drag Operations
  // ===========================================================================

  /**
   * Start selection drag (called by framework after handleCellMouseDown returns startDrag: 'selection')
   */
  startSelectionDrag(): void {
    this.isDraggingSelection = true;
  }

  /**
   * Handle drag move event (selection or fill)
   */
  handleDragMove(
    event: PointerEventData,
    bounds: ContainerBounds
  ): DragMoveResult | null {
    if (!this.isDraggingSelection && !this.isDraggingFill) {
      return null;
    }

    const { top, left, width, height, scrollTop, scrollLeft } = bounds;
    const headerHeight = this.deps.getHeaderHeight();
    const columnPositions = this.deps.getColumnPositions();
    const columnCount = this.deps.getColumnCount();

    // Calculate mouse position relative to grid content
    const mouseX = event.clientX - left + scrollLeft;
    // Viewport-relative Y (physical pixels below header, NOT including scroll)
    const viewportY = event.clientY - top - headerHeight;

    // Find target row (core method handles scroll and scaling)
    const targetRow = Math.max(
      0,
      Math.min(
        this.core.getRowIndexAtDisplayY(viewportY, scrollTop),
        this.core.getRowCount() - 1
      )
    );

    // Find target column (visible index first, then convert to original)
    const visibleColIndex = Math.max(
      0,
      Math.min(findColumnAtX(mouseX, columnPositions), columnCount - 1)
    );
    // Convert visible index to original column index (for hidden column support)
    const targetCol = this.deps.getOriginalColumnIndex
      ? this.deps.getOriginalColumnIndex(visibleColIndex)
      : visibleColIndex;

    // Handle selection drag
    if (this.isDraggingSelection) {
      this.core.selection.startSelection(
        { row: targetRow, col: targetCol },
        { shift: true }
      );
    }

    // Handle fill drag
    if (this.isDraggingFill) {
      this.core.fill.updateFillDrag(targetRow, targetCol);
      this.fillTarget = { row: targetRow, col: targetCol };
    }

    // Calculate auto-scroll
    const mouseYInContainer = event.clientY - top;
    const mouseXInContainer = event.clientX - left;
    const autoScroll = this.calculateAutoScroll(
      mouseYInContainer,
      mouseXInContainer,
      height,
      width,
      headerHeight
    );

    return { targetRow, targetCol, autoScroll };
  }

  /**
   * Handle drag end event
   */
  handleDragEnd(): void {
    if (this.isDraggingFill) {
      this.core.fill.commitFillDrag();
      this.core.refreshSlotData();
    }

    this.isDraggingSelection = false;
    this.isDraggingFill = false;
    this.fillSourceRange = null;
    this.fillTarget = null;
  }

  // ===========================================================================
  // Wheel
  // ===========================================================================

  /**
   * Handle wheel event with dampening for large datasets
   * Returns scroll deltas or null if no dampening needed
   */
  handleWheel(
    deltaY: number,
    deltaX: number,
    dampening: number
  ): { dy: number; dx: number } | null {
    if (!this.core.isScalingActive()) {
      return null;
    }
    return { dy: deltaY * dampening, dx: deltaX * dampening };
  }

  // ===========================================================================
  // Keyboard
  // ===========================================================================

  /**
   * Handle keyboard event
   */
  handleKeyDown(
    event: KeyEventData,
    activeCell: CellPosition | null,
    editingCell: { row: number; col: number } | null,
    filterPopupOpen: boolean
  ): KeyboardResult {
    // Don't handle keyboard events when filter popup is open
    if (filterPopupOpen) {
      return { preventDefault: false };
    }

    // Don't handle most keys while editing (except special keys)
    if (
      editingCell &&
      event.key !== "Enter" &&
      event.key !== "Escape" &&
      event.key !== "Tab"
    ) {
      return { preventDefault: false };
    }

    const { selection } = this.core;
    const isShift = event.shiftKey;
    const isCtrl = event.ctrlKey || event.metaKey;

    // Helper to get key direction
    const keyToDirection = (key: string): Direction | null => {
      switch (key) {
        case "ArrowUp":
          return "up";
        case "ArrowDown":
          return "down";
        case "ArrowLeft":
          return "left";
        case "ArrowRight":
          return "right";
        default:
          return null;
      }
    };

    // Arrow key navigation
    const direction = keyToDirection(event.key);
    if (direction) {
      selection.moveFocus(direction, isShift);
      const newActiveCell = selection.getActiveCell();
      return {
        preventDefault: true,
        scrollToCell: newActiveCell ?? undefined,
      };
    }

    switch (event.key) {
      case "Enter":
        if (editingCell) {
          this.core.commitEdit();
        } else if (activeCell) {
          this.core.startEdit(activeCell.row, activeCell.col);
        }
        return { preventDefault: true };

      case "Escape":
        if (editingCell) {
          this.core.cancelEdit();
        } else {
          selection.clearSelection();
        }
        return { preventDefault: true };

      case "Tab":
        if (editingCell) {
          this.core.commitEdit();
        }
        selection.moveFocus(isShift ? "left" : "right", false);
        return { preventDefault: true };

      case "a":
        if (isCtrl) {
          selection.selectAll();
          return { preventDefault: true };
        }
        break;

      case "c":
        if (isCtrl) {
          selection.copySelectionToClipboard();
          return { preventDefault: true };
        }
        break;

      case "F2":
        if (activeCell && !editingCell) {
          this.core.startEdit(activeCell.row, activeCell.col);
        }
        return { preventDefault: true };

      case "Delete":
      case "Backspace":
        // Start editing with empty value on delete/backspace
        if (activeCell && !editingCell) {
          this.core.startEdit(activeCell.row, activeCell.col);
          return { preventDefault: true };
        }
        break;

      default:
        // Start editing on any printable character
        if (activeCell && !editingCell && !isCtrl && event.key.length === 1) {
          this.core.startEdit(activeCell.row, activeCell.col);
        }
        break;
    }

    return { preventDefault: false };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Calculate auto-scroll deltas based on mouse position
   */
  private calculateAutoScroll(
    mouseYInContainer: number,
    mouseXInContainer: number,
    containerHeight: number,
    containerWidth: number,
    headerHeight: number
  ): { dx: number; dy: number } | null {
    let dx = 0;
    let dy = 0;

    // Vertical scrolling
    if (mouseYInContainer < AUTO_SCROLL_THRESHOLD + headerHeight) {
      dy = -AUTO_SCROLL_SPEED;
    } else if (mouseYInContainer > containerHeight - AUTO_SCROLL_THRESHOLD) {
      dy = AUTO_SCROLL_SPEED;
    }

    // Horizontal scrolling
    if (mouseXInContainer < AUTO_SCROLL_THRESHOLD) {
      dx = -AUTO_SCROLL_SPEED;
    } else if (mouseXInContainer > containerWidth - AUTO_SCROLL_THRESHOLD) {
      dx = AUTO_SCROLL_SPEED;
    }

    return dx !== 0 || dy !== 0 ? { dx, dy } : null;
  }
}
