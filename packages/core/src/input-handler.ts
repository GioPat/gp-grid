// packages/core/src/input-handler.ts
// Framework-agnostic input handler. Thin dispatcher that routes pointer
// events to focused drag-mode classes (see `./input/`) and keeps keyboard
// handling in-place.

import type { GridCore } from "./grid-core";
import type { CellPosition, CellRange, RowGroupResult, SortDirection } from "./types";
import type {
  PointerEventData,
  KeyEventData,
  ContainerBounds,
  InputResult,
  KeyboardResult,
  DragMoveResult,
  DragState,
  ResizeTarget,
} from "./types/input";
import {
  ColumnResizeDrag,
  RowResizeDrag,
  ColumnMoveDrag,
  RowDrag,
  SelectionDrag,
  FillDrag,
  PendingRowDragState,
  PendingCellTapState,
  KeyboardHandler,
  computeCellTarget,
  applyGridResizeAction,
  resolveHandleFit,
  isGroupRow,
  wheelDeltaToPx,
  DOM_DELTA_PIXEL,
  MotionGate,
  type InputCommands,
} from "./input";

// =============================================================================
// Helpers (module-private)
// =============================================================================

const cycleSortDirection = (
  current: SortDirection | null | undefined,
): SortDirection | null => {
  if (current == null) return "asc";
  if (current === "asc") return "desc";
  return null;
};

// =============================================================================
// InputHandler Class
// =============================================================================

export class InputHandler<TData = unknown> {
  private readonly core: GridCore<TData>;
  private readonly motion: MotionGate;

  readonly columnResize: ColumnResizeDrag<TData>;
  readonly rowResize: RowResizeDrag<TData>;
  readonly columnMove: ColumnMoveDrag<TData>;
  readonly rowDrag: RowDrag<TData>;
  readonly selectionDrag: SelectionDrag<TData>;
  readonly fillDrag: FillDrag<TData>;
  private readonly pendingRowDrag = new PendingRowDragState();
  private readonly pendingCellTap = new PendingCellTapState();
  private readonly keyboard: KeyboardHandler<TData>;
  private readonly commands: InputCommands;

  constructor(core: GridCore<TData>, commands: InputCommands) {
    this.core = core;
    this.commands = commands;
    this.motion = new MotionGate(core.viewport);
    this.columnResize = new ColumnResizeDrag(core);
    this.rowResize = new RowResizeDrag(core, commands);
    this.columnMove = new ColumnMoveDrag(core);
    this.rowDrag = new RowDrag(core);
    this.selectionDrag = new SelectionDrag(core);
    this.fillDrag = new FillDrag(core);
    this.keyboard = new KeyboardHandler(core, commands);
  }

  // ---------------------------------------------------------------------------
  // Drag state (for UI rendering)
  // ---------------------------------------------------------------------------

  getDragState(): DragState {
    const dragType = this.getDragType();
    const fillSnapshot = this.fillDrag.stateSnapshot;
    return {
      isDragging: dragType !== null,
      dragType,
      fillSourceRange: fillSnapshot.sourceRange,
      fillTarget: fillSnapshot.target,
      columnResize: this.columnResize.getState(),
      rowResize: this.rowResize.getState(),
      columnMove: this.columnMove.getState(),
      rowDrag: this.rowDrag.getState(),
    };
  }

  private getDragType(): DragState["dragType"] {
    if (this.fillDrag.isActive) return "fill";
    if (this.columnResize.isActive) return "column-resize";
    if (this.rowResize.isActive) return "row-resize";
    if (this.columnMove.isDraggingForDisplay) return "column-move";
    if (this.rowDrag.isDraggingForDisplay) return "row-drag";
    if (this.selectionDrag.isActive) return "selection";
    return null;
  }

  // ---------------------------------------------------------------------------
  // Pointer entry points
  // ---------------------------------------------------------------------------

  handleHeaderMouseDown(
    colIndex: number,
    colWidth: number,
    colHeight: number,
    event: PointerEventData,
  ): InputResult {
    if (this.motion.absorbPress(event.pointerType)) return swallowedResult;
    return this.columnMove.start(colIndex, colWidth, colHeight, event);
  }

  handleHeaderResizeMouseDown(
    colIndex: number,
    colWidth: number,
    event: PointerEventData,
  ): InputResult {
    if (this.motion.absorbPress(event.pointerType)) return swallowedResult;
    return this.columnResize.start(colIndex, colWidth, event);
  }

  handleRowResizeMouseDown(
    rowIndex: number,
    rowHeight: number,
    event: PointerEventData,
  ): InputResult {
    if (this.motion.absorbPress(event.pointerType)) return swallowedResult;
    if (this.core.rowHeights.isResizable() === false) return noopResult;
    return this.rowResize.start(rowIndex, rowHeight, event);
  }

  /** A double-click on a column or row edge handle fits that target once. */
  handleResizeDoubleClick(target: ResizeTarget): void {
    if (this.motion.absorbClick()) return;
    const action = resolveHandleFit(this.core, target);
    if (action !== null) applyGridResizeAction(this.core, this.commands, action);
  }

  handleCellMouseDown(
    rowIndex: number,
    colIndex: number,
    event: PointerEventData,
  ): InputResult {
    if (this.motion.absorbPress(event.pointerType)) return swallowedResult;
    if (event.button !== 0) return noopResult;
    if (this.core.edit.getState() !== null) return noopResult;

    // Any new cell interaction closes an open peek overlay.
    this.core.edit.stopPeek();

    const column = this.core.columns.get()[colIndex];
    // A hierarchy's order is derived, so no row drag starts.
    const wantsRowDrag =
      (column?.rowDrag === true || this.core.rowDrag.isEntireRow()) &&
      !event.shiftKey &&
      this.core.rowGroups.isActive() === false;

    if (wantsRowDrag && event.pointerType === "touch") {
      return this.startPendingRowDrag(rowIndex, colIndex, event);
    }
    if (wantsRowDrag) {
      return this.startRowDrag(rowIndex, colIndex, event);
    }
    return this.startSelectionClick(rowIndex, colIndex, event);
  }

  private startPendingRowDrag(
    rowIndex: number,
    colIndex: number,
    event: PointerEventData,
  ): InputResult {
    this.pendingRowDrag.set({
      rowIndex,
      colIndex,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    // Selection is deferred: the long-press confirm selects the dragged row,
    // a quick release confirms the tap, and a scroll selects nothing.
    this.pendingCellTap.set({ rowIndex, colIndex });
    return {
      preventDefault: false,
      stopPropagation: false,
      focusContainer: false,
      startDrag: "row-drag-pending",
      startTap: true,
    };
  }

  private startRowDrag(
    rowIndex: number,
    colIndex: number,
    event: PointerEventData,
  ): InputResult {
    this.rowDrag.start(rowIndex, event.clientX, event.clientY);
    this.core.selection.startSelection(
      { row: rowIndex, col: colIndex },
      { shift: false, ctrl: false },
    );
    return {
      preventDefault: true,
      stopPropagation: true,
      focusContainer: true,
      startDrag: "row-drag",
    };
  }

  private startSelectionClick(
    rowIndex: number,
    colIndex: number,
    event: PointerEventData,
  ): InputResult {
    if (event.pointerType === "touch") {
      // Defer selection until the tap is confirmed on pointerup, so a
      // scroll gesture never selects a cell (or shows the fill handle).
      // Touch also never starts selection-range dragging: the gesture
      // belongs to scrolling.
      this.pendingCellTap.set({ rowIndex, colIndex });
      return {
        preventDefault: false,
        stopPropagation: false,
        focusContainer: false,
        startTap: true,
      };
    }
    this.core.selection.startSelection(
      { row: rowIndex, col: colIndex },
      { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey },
    );
    return {
      preventDefault: false,
      stopPropagation: false,
      focusContainer: true,
      startDrag: event.shiftKey ? undefined : "selection",
    };
  }

  handleCellDoubleClick(rowIndex: number, colIndex: number): void {
    if (this.motion.absorbClick()) return;
    if (isGroupRow(this.core, rowIndex)) {
      this.commands.toggleGroupAt(rowIndex);
      return;
    }
    const column = this.core.columns.get()[colIndex];
    if (column?.editable) {
      this.core.edit.start(rowIndex, colIndex);
      return;
    }
    this.core.edit.startPeek(rowIndex, colIndex);
  }

  /** A pointer down on a group row's expander. */
  handleGroupToggle(rowIndex: number, pointerType?: string): RowGroupResult {
    if (this.motion.absorbPress(pointerType)) return { status: "unchanged" };
    return this.commands.toggleGroupAt(rowIndex);
  }

  handleCellMouseEnter(rowIndex: number, colIndex: number): void {
    this.core.highlight?.setHoverPosition({ row: rowIndex, col: colIndex });
  }

  handleCellMouseLeave(): void {
    this.core.highlight?.setHoverPosition(null);
  }

  handleFillHandleMouseDown(
    activeCell: CellPosition | null,
    selectionRange: CellRange | null,
    event: PointerEventData,
  ): InputResult {
    if (this.motion.absorbPress(event.pointerType)) return swallowedResult;
    return this.fillDrag.start(activeCell, selectionRange);
  }

  handleHeaderClick(colId: string, addToExisting: boolean): void {
    if (this.motion.absorbClick()) return;
    const currentDirection = this.core
      .sortFilter.getSortModel()
      .find((s) => s.colId === colId)?.direction;
    this.core.sortFilter.setSort(colId, cycleSortDirection(currentDirection), addToExisting);
  }

  // ---------------------------------------------------------------------------
  // Drag lifecycle (move/end dispatch)
  // ---------------------------------------------------------------------------

  startSelectionDrag(): void {
    this.selectionDrag.start();
  }

  confirmPendingRowDrag(): boolean {
    const pending = this.pendingRowDrag.consume();
    if (pending === null) return false;
    this.pendingCellTap.clear();
    this.rowDrag.start(pending.rowIndex, pending.clientX, pending.clientY);
    this.core.selection.startSelection(
      { row: pending.rowIndex, col: pending.colIndex },
      { shift: false, ctrl: false },
    );
    return true;
  }

  cancelPendingRowDrag(): void {
    this.pendingRowDrag.clear();
  }

  confirmPendingCellTap(): boolean {
    const pending = this.pendingCellTap.consume();
    if (pending === null) return false;
    this.core.selection.startSelection(
      { row: pending.rowIndex, col: pending.colIndex },
      { shift: false, ctrl: false },
    );
    return true;
  }

  cancelPendingCellTap(): void {
    this.pendingCellTap.clear();
  }

  handleDragMove(
    event: PointerEventData,
    bounds: ContainerBounds,
  ): DragMoveResult | null {
    if (this.columnResize.isActive) return this.columnResize.move(event, bounds);
    if (this.rowResize.isActive) return this.rowResize.move(event);
    if (this.columnMove.isActive) return this.columnMove.move(event, bounds);
    if (this.rowDrag.isActive) return this.rowDrag.move(event, bounds);
    return this.selectionFillMove(event, bounds);
  }

  private selectionFillMove(
    event: PointerEventData,
    bounds: ContainerBounds,
  ): DragMoveResult | null {
    const isActive = this.selectionDrag.isActive || this.fillDrag.isActive;
    if (isActive === false) return null;

    const target = computeCellTarget(this.core, event, bounds);
    this.selectionDrag.moveToTarget(target.row, target.col);
    this.fillDrag.moveToTarget(target.row, target.col);
    return {
      targetRow: target.row,
      targetCol: target.col,
      autoScroll: target.autoScroll,
    };
  }

  handleDragEnd(): void {
    if (this.columnResize.isActive) return this.columnResize.end();
    if (this.rowResize.isActive) return this.rowResize.end();
    if (this.columnMove.isActive) return this.columnMove.end(cycleSortDirection);
    if (this.rowDrag.isActive) return this.rowDrag.end();
    this.selectionDrag.end();
    this.fillDrag.end();
  }

  // ---------------------------------------------------------------------------
  // Wheel
  // ---------------------------------------------------------------------------

  /** Only the vertical axis is scaled, so only `dy` is dampened. */
  handleWheel(
    deltaY: number,
    deltaX: number,
    dampening: number,
    deltaMode = DOM_DELTA_PIXEL,
  ): { dy: number; dx: number } | null {
    if (this.core.viewport.isScaling() === false) return null;
    return {
      dy: wheelDeltaToPx(deltaY, deltaMode) * dampening,
      dx: wheelDeltaToPx(deltaX, deltaMode),
    };
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  handleKeyDown(
    event: KeyEventData,
    activeCell: CellPosition | null,
    editingCell: { row: number; col: number } | null,
    filterPopupOpen: boolean,
  ): KeyboardResult {
    return this.keyboard.handle(event, activeCell, editingCell, filterPopupOpen);
  }
}

const noopResult: InputResult = { preventDefault: false, stopPropagation: false };
const swallowedResult: InputResult = { preventDefault: true, stopPropagation: true };
