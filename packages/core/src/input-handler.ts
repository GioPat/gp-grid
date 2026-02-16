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
  ColumnResizeDragState,
  ColumnMoveDragState,
  RowDragState,
} from "./types/input";
import type { Direction } from "./selection";
import { findColumnAtX } from "./utils";

// =============================================================================
// Constants
// =============================================================================

const AUTO_SCROLL_THRESHOLD = 40;
const AUTO_SCROLL_SPEED = 10;
const DRAG_THRESHOLD = 5;
const DEFAULT_MIN_COLUMN_WIDTH = 50;

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

  // Column resize state
  private isDraggingColumnResize = false;
  private resizeColIndex = -1;
  private resizeStartX = 0;
  private resizeInitialWidth = 0;
  private resizeCurrentWidth = 0;

  // Column move state
  private isDraggingColumnMove = false;
  private moveSourceColIndex = -1;
  private moveStartX = 0;
  private moveStartY = 0;
  private moveThresholdMet = false;
  private moveGhostWidth = 0;
  private moveGhostHeight = 0;
  private moveCurrentX = 0;
  private moveCurrentY = 0;
  private moveDropTargetIndex: number | null = null;

  // Row drag state
  private isDraggingRow = false;
  private rowDragSourceIndex = -1;
  private rowDragStartX = 0;
  private rowDragStartY = 0;
  private rowDragThresholdMet = false;
  private rowDragCurrentX = 0;
  private rowDragCurrentY = 0;
  private rowDragDropTargetIndex: number | null = null;

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
    const isDragging = this.isDraggingSelection || this.isDraggingFill
      || this.isDraggingColumnResize || (this.isDraggingColumnMove && this.moveThresholdMet)
      || (this.isDraggingRow && this.rowDragThresholdMet);

    const dragType: DragState["dragType"] = this.isDraggingFill
      ? "fill"
      : this.isDraggingColumnResize
        ? "column-resize"
        : (this.isDraggingColumnMove && this.moveThresholdMet)
          ? "column-move"
          : (this.isDraggingRow && this.rowDragThresholdMet)
            ? "row-drag"
            : this.isDraggingSelection
              ? "selection"
              : null;

    const columnResize: ColumnResizeDragState | null = this.isDraggingColumnResize
      ? { colIndex: this.resizeColIndex, initialWidth: this.resizeInitialWidth, currentWidth: this.resizeCurrentWidth }
      : null;

    const columnMove: ColumnMoveDragState | null = (this.isDraggingColumnMove && this.moveThresholdMet)
      ? {
        sourceColIndex: this.moveSourceColIndex,
        currentX: this.moveCurrentX,
        currentY: this.moveCurrentY,
        dropTargetIndex: this.moveDropTargetIndex,
        ghostWidth: this.moveGhostWidth,
        ghostHeight: this.moveGhostHeight,
      }
      : null;

    const rowDrag: RowDragState | null = (this.isDraggingRow && this.rowDragThresholdMet)
      ? {
        sourceRowIndex: this.rowDragSourceIndex,
        currentX: this.rowDragCurrentX,
        currentY: this.rowDragCurrentY,
        dropTargetIndex: this.rowDragDropTargetIndex,
        dropIndicatorY: this.rowDragDropTargetIndex !== null
          ? this.core.getRowTranslateY(this.rowDragDropTargetIndex)
          : 0,
      }
      : null;

    return {
      isDragging,
      dragType,
      fillSourceRange: this.fillSourceRange,
      fillTarget: this.fillTarget,
      columnResize,
      columnMove,
      rowDrag,
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

    // Check if this should start a row drag
    const column = this.core.getColumns()[colIndex];
    const isRowDragEntireRow = this.core.isRowDragEntireRow();
    const isRowDragHandle = column?.rowDrag === true;

    if ((isRowDragHandle || isRowDragEntireRow) && !event.shiftKey) {
      this.isDraggingRow = true;
      this.rowDragSourceIndex = rowIndex;
      this.rowDragStartX = event.clientX;
      this.rowDragStartY = event.clientY;
      this.rowDragThresholdMet = false;
      this.rowDragCurrentX = event.clientX;
      this.rowDragCurrentY = event.clientY;
      this.rowDragDropTargetIndex = null;

      // Still set active cell for visual feedback
      this.core.selection.startSelection(
        { row: rowIndex, col: colIndex },
        { shift: false, ctrl: false }
      );

      return {
        preventDefault: true,
        stopPropagation: true,
        focusContainer: true,
        startDrag: "row-drag",
      };
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
  // Column Resize
  // ===========================================================================

  /**
   * Handle mousedown on the resize handle of a header cell.
   * Returns InputResult with startDrag: "column-resize".
   */
  handleHeaderResizeMouseDown(
    colIndex: number,
    colWidth: number,
    event: PointerEventData,
  ): InputResult {
    if (event.button !== 0) {
      return { preventDefault: false, stopPropagation: false };
    }

    const column = this.core.getColumns()[colIndex];
    if (column?.resizable === false) {
      return { preventDefault: false, stopPropagation: false };
    }

    this.isDraggingColumnResize = true;
    this.resizeColIndex = colIndex;
    this.resizeStartX = event.clientX;
    this.resizeInitialWidth = colWidth;
    this.resizeCurrentWidth = colWidth;

    return {
      preventDefault: true,
      stopPropagation: true,
      startDrag: "column-resize",
    };
  }

  // ===========================================================================
  // Column Move
  // ===========================================================================

  /**
   * Handle mousedown on a header cell for potential column move.
   * Uses a drag threshold to distinguish click (sort) vs drag (move).
   */
  handleHeaderMouseDown(
    colIndex: number,
    colWidth: number,
    colHeight: number,
    event: PointerEventData,
  ): InputResult {
    if (event.button !== 0) {
      return { preventDefault: false, stopPropagation: false };
    }

    const column = this.core.getColumns()[colIndex];
    if (column?.movable === false) {
      return { preventDefault: false, stopPropagation: false };
    }

    this.isDraggingColumnMove = true;
    this.moveSourceColIndex = colIndex;
    this.moveStartX = event.clientX;
    this.moveStartY = event.clientY;
    this.moveThresholdMet = false;
    this.moveGhostWidth = colWidth;
    this.moveGhostHeight = colHeight;
    this.moveCurrentX = event.clientX;
    this.moveCurrentY = event.clientY;
    this.moveDropTargetIndex = null;

    return {
      preventDefault: true,
      stopPropagation: true,
      startDrag: "column-move",
    };
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
   * Handle drag move event (selection, fill, column-resize, column-move, or row-drag)
   */
  handleDragMove(
    event: PointerEventData,
    bounds: ContainerBounds
  ): DragMoveResult | null {
    // --- Column resize drag ---
    if (this.isDraggingColumnResize) {
      const column = this.core.getColumns()[this.resizeColIndex];
      const minWidth = column?.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
      const maxWidth = column?.maxWidth;
      let newWidth = this.resizeInitialWidth + (event.clientX - this.resizeStartX);
      newWidth = Math.max(minWidth, newWidth);
      if (maxWidth !== undefined) {
        newWidth = Math.min(maxWidth, newWidth);
      }
      this.resizeCurrentWidth = newWidth;
      return { targetRow: 0, targetCol: this.resizeColIndex, autoScroll: null };
    }

    // --- Column move drag ---
    if (this.isDraggingColumnMove) {
      const dx = event.clientX - this.moveStartX;
      const dy = event.clientY - this.moveStartY;

      if (!this.moveThresholdMet) {
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          this.moveThresholdMet = true;
        } else {
          return null;
        }
      }

      this.moveCurrentX = event.clientX;
      this.moveCurrentY = event.clientY;

      // Compute drop target from mouse X (visible index space)
      const { left, scrollLeft } = bounds;
      const mouseX = event.clientX - left + scrollLeft;
      const columnPositions = this.deps.getColumnPositions();
      const columnCount = this.deps.getColumnCount();
      this.moveDropTargetIndex = Math.max(
        0,
        Math.min(findColumnAtX(mouseX, columnPositions), columnCount)
      );

      return { targetRow: 0, targetCol: this.moveDropTargetIndex ?? 0, autoScroll: null };
    }

    // --- Row drag ---
    if (this.isDraggingRow) {
      const dx = event.clientX - this.rowDragStartX;
      const dy = event.clientY - this.rowDragStartY;

      if (!this.rowDragThresholdMet) {
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          this.rowDragThresholdMet = true;
        } else {
          return null;
        }
      }

      this.rowDragCurrentX = event.clientX;
      this.rowDragCurrentY = event.clientY;

      // Compute drop target from mouse Y
      // bounds.top is the body container top (already below header), so no headerHeight subtraction
      const { top, height, width, scrollTop } = bounds;
      const headerHeight = this.deps.getHeaderHeight();
      const viewportY = event.clientY - top;
      const rowCount = this.core.getRowCount();

      const targetRow = Math.max(
        0,
        Math.min(
          this.core.getRowIndexAtDisplayY(viewportY, scrollTop),
          rowCount
        )
      );
      this.rowDragDropTargetIndex = targetRow;

      // Calculate auto-scroll (vertical only for row drag)
      const mouseYInContainer = event.clientY - top;
      const mouseXInContainer = event.clientX - bounds.left;
      const autoScroll = this.calculateAutoScroll(
        mouseYInContainer,
        mouseXInContainer,
        height,
        width,
        headerHeight
      );

      return { targetRow, targetCol: 0, autoScroll };
    }

    // --- Selection or fill drag ---
    if (!this.isDraggingSelection && !this.isDraggingFill) {
      return null;
    }

    const { top, left, width, height, scrollTop, scrollLeft } = bounds;
    const headerHeight = this.deps.getHeaderHeight();
    const columnPositions = this.deps.getColumnPositions();
    const columnCount = this.deps.getColumnCount();

    // Calculate mouse position relative to grid content
    const mouseX = event.clientX - left + scrollLeft;
    // Viewport-relative Y: bounds.top is the body container top (already below header)
    const viewportY = event.clientY - top;

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
    // --- Column resize end ---
    if (this.isDraggingColumnResize) {
      this.core.setColumnWidth(this.resizeColIndex, this.resizeCurrentWidth);
      this.isDraggingColumnResize = false;
      this.resizeColIndex = -1;
      return;
    }

    // --- Column move end ---
    if (this.isDraggingColumnMove) {
      if (this.moveThresholdMet && this.moveDropTargetIndex !== null) {
        // moveSourceColIndex is already an original index (passed from framework layer).
        // moveDropTargetIndex is a visible index (computed from mouse position), so convert it.
        const fromOriginal = this.moveSourceColIndex;
        const toOriginal = this.deps.getOriginalColumnIndex
          ? this.deps.getOriginalColumnIndex(
              Math.min(this.moveDropTargetIndex, this.deps.getColumnCount() - 1)
            )
          : this.moveDropTargetIndex;

        // Only move if the drop target is different from the source
        if (fromOriginal !== toOriginal) {
          this.core.moveColumn(fromOriginal, toOriginal);
        }
      } else if (!this.moveThresholdMet) {
        // Threshold not met — treat as a click (sort).
        // moveSourceColIndex is already an original index.
        const column = this.core.getColumns()[this.moveSourceColIndex];
        if (column) {
          const colId = column.colId ?? column.field;
          this.handleHeaderClick(colId, false);
        }
      }
      this.isDraggingColumnMove = false;
      this.moveSourceColIndex = -1;
      this.moveThresholdMet = false;
      this.moveDropTargetIndex = null;
      return;
    }

    // --- Row drag end ---
    if (this.isDraggingRow) {
      if (this.rowDragThresholdMet && this.rowDragDropTargetIndex !== null) {
        if (this.rowDragDropTargetIndex !== this.rowDragSourceIndex) {
          this.core.commitRowDrag(this.rowDragSourceIndex, this.rowDragDropTargetIndex);
        }
      }
      this.isDraggingRow = false;
      this.rowDragSourceIndex = -1;
      this.rowDragThresholdMet = false;
      this.rowDragDropTargetIndex = null;
      return;
    }

    // --- Fill drag end ---
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
