// packages/core/src/input-handler.ts
// Framework-agnostic input handler. Thin dispatcher that routes pointer
// events to focused drag-mode classes (see `./input/`) and keeps keyboard
// handling in-place.

import type { GridCore } from "./grid-core";
import type { CellPosition, CellRange, SortDirection } from "./types";
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
import {
  ColumnResizeDrag,
  ColumnMoveDrag,
  RowDrag,
  SelectionDrag,
  FillDrag,
  PendingRowDragState,
  KeyboardHandler,
  computeCellTarget,
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
  private deps: InputHandlerDeps;

  readonly columnResize: ColumnResizeDrag<TData>;
  readonly columnMove: ColumnMoveDrag<TData>;
  readonly rowDrag: RowDrag<TData>;
  readonly selectionDrag: SelectionDrag<TData>;
  readonly fillDrag: FillDrag<TData>;
  private readonly pendingRowDrag = new PendingRowDragState();
  private readonly keyboard: KeyboardHandler<TData>;

  constructor(core: GridCore<TData>, deps: InputHandlerDeps) {
    this.core = core;
    this.deps = deps;
    this.columnResize = new ColumnResizeDrag(core);
    this.columnMove = new ColumnMoveDrag(core, deps);
    this.rowDrag = new RowDrag(core, deps);
    this.selectionDrag = new SelectionDrag(core);
    this.fillDrag = new FillDrag(core);
    this.keyboard = new KeyboardHandler(core);
  }

  /** Update dependencies (called when options change) */
  updateDeps(deps: Partial<InputHandlerDeps>): void {
    this.deps = { ...this.deps, ...deps };
    this.columnMove.updateDeps(this.deps);
    this.rowDrag.updateDeps(this.deps);
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
      columnMove: this.columnMove.getState(),
      rowDrag: this.rowDrag.getState(),
    };
  }

  private getDragType(): DragState["dragType"] {
    if (this.fillDrag.isActive) return "fill";
    if (this.columnResize.isActive) return "column-resize";
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
    return this.columnMove.start(colIndex, colWidth, colHeight, event);
  }

  handleHeaderResizeMouseDown(
    colIndex: number,
    colWidth: number,
    event: PointerEventData,
  ): InputResult {
    return this.columnResize.start(colIndex, colWidth, event);
  }

  handleCellMouseDown(
    rowIndex: number,
    colIndex: number,
    event: PointerEventData,
  ): InputResult {
    if (event.button !== 0) return noopResult;
    if (this.core.getEditState() !== null) return noopResult;

    const column = this.core.getColumns()[colIndex];
    const wantsRowDrag =
      (column?.rowDrag === true || this.core.isRowDragEntireRow()) &&
      !event.shiftKey;

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
    this.core.selection.startSelection(
      { row: rowIndex, col: colIndex },
      { shift: false, ctrl: false },
    );
    return {
      preventDefault: false,
      stopPropagation: false,
      focusContainer: true,
      startDrag: "row-drag-pending",
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
    this.core.startEdit(rowIndex, colIndex);
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
    _event: PointerEventData,
  ): InputResult {
    return this.fillDrag.start(activeCell, selectionRange);
  }

  handleHeaderClick(colId: string, addToExisting: boolean): void {
    const currentDirection = this.core
      .getSortModel()
      .find((s) => s.colId === colId)?.direction;
    this.core.setSort(colId, cycleSortDirection(currentDirection), addToExisting);
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
    this.rowDrag.start(pending.rowIndex, pending.clientX, pending.clientY);
    return true;
  }

  cancelPendingRowDrag(): void {
    this.pendingRowDrag.clear();
  }

  handleDragMove(
    event: PointerEventData,
    bounds: ContainerBounds,
  ): DragMoveResult | null {
    if (this.columnResize.isActive) return this.columnResize.move(event, bounds);
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

    const target = computeCellTarget(this.core, this.deps, event, bounds);
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
    if (this.columnMove.isActive) return this.columnMove.end(cycleSortDirection);
    if (this.rowDrag.isActive) return this.rowDrag.end();
    this.selectionDrag.end();
    this.fillDrag.end();
  }

  // ---------------------------------------------------------------------------
  // Wheel
  // ---------------------------------------------------------------------------

  handleWheel(
    deltaY: number,
    deltaX: number,
    dampening: number,
  ): { dy: number; dx: number } | null {
    if (!this.core.isScalingActive()) return null;
    return { dy: deltaY * dampening, dx: deltaX * dampening };
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
