import type { GridCore } from "../grid-core";
import type { CellPosition, CellRange } from "../types/basic";
import type {
  DragState,
  InputResult,
  KeyboardResult,
  PointerEventData,
} from "../types/input";
import { toPointerEventData } from "./pointer-event";
import type { AutoScrollDriver } from "./auto-scroll";
import type { PendingRowDragController } from "./pending-row-drag";

export interface InputEventAdapterDeps<TData = unknown> {
  getCore: () => GridCore<TData> | null;
  getBodyEl: () => HTMLElement | null;
  autoScroll: AutoScrollDriver;
  pendingRowDrag: PendingRowDragController;
  onDragStateChange: (state: DragState) => void;
}

export interface CellPointerAction {
  preventDefault: boolean;
  focusContainer: boolean;
}

export interface FillPointerAction {
  preventDefault: boolean;
  stopPropagation: boolean;
}

export interface DragEndResult {
  wasRowDrag: boolean;
}

/**
 * Shared event-to-core adapter consumed by every framework wrapper.
 *
 * Each method accepts a DOM event (PointerEvent/KeyboardEvent) plus any
 * caller-side state the core needs, converts the event to the framework-
 * agnostic PointerEventData/KeyEventData shape, forwards it to core's
 * input handler, and performs the side effects that would otherwise be
 * reimplemented in each wrapper (drag-start dispatch, pointer capture,
 * auto-scroll start/stop, row-drag teardown).
 *
 * Methods return primitive "hint" objects so the wrapper can apply the
 * DOM actions that are framework-specific (preventDefault, focus, scroll
 * to cell, release container locks).
 */
export class InputEventAdapter<TData = unknown> {
  private readonly deps: InputEventAdapterDeps<TData>;

  constructor(deps: InputEventAdapterDeps<TData>) {
    this.deps = deps;
  }

  headerPointerDown(
    colIndex: number,
    colWidth: number,
    colHeight: number,
    event: PointerEvent,
  ): boolean {
    const core = this.deps.getCore();
    if (core === null) return false;
    const result = core.input.handleHeaderMouseDown(
      colIndex,
      colWidth,
      colHeight,
      toPointerEventData(event),
    );
    return result.preventDefault;
  }

  resizePointerDown(colIndex: number, colWidth: number, event: PointerEvent): boolean {
    const core = this.deps.getCore();
    if (core === null) return false;
    const result = core.input.handleHeaderResizeMouseDown(
      colIndex,
      colWidth,
      toPointerEventData(event),
    );
    return result.preventDefault;
  }

  cellPointerDown(rowIndex: number, colIndex: number, event: PointerEvent): CellPointerAction {
    const core = this.deps.getCore();
    if (core === null) return { preventDefault: false, focusContainer: false };
    const result = core.input.handleCellMouseDown(
      rowIndex,
      colIndex,
      toPointerEventData(event),
    );
    this.dispatchCellDragStart(result.startDrag, event);
    return {
      preventDefault: result.preventDefault,
      focusContainer: result.focusContainer ?? false,
    };
  }

  cellPointerEnter(rowIndex: number, colIndex: number): void {
    this.deps.getCore()?.input.handleCellMouseEnter(rowIndex, colIndex);
  }

  cellPointerLeave(): void {
    this.deps.getCore()?.input.handleCellMouseLeave();
  }

  fillHandlePointerDown(
    activeCell: CellPosition | null,
    selectionRange: CellRange | null,
    event: PointerEvent,
  ): FillPointerAction {
    const core = this.deps.getCore();
    if (core === null) return { preventDefault: false, stopPropagation: false };
    const result = core.input.handleFillHandleMouseDown(
      activeCell,
      selectionRange,
      toPointerEventData(event),
    );
    if (result.startDrag === "fill") {
      capturePointer(event);
      this.deps.onDragStateChange(core.input.getDragState());
    }
    return {
      preventDefault: result.preventDefault,
      stopPropagation: result.stopPropagation,
    };
  }

  dragMove(event: PointerEvent): void {
    const core = this.deps.getCore();
    const bodyEl = this.deps.getBodyEl();
    if (core === null || bodyEl === null) return;
    const rect = bodyEl.getBoundingClientRect();
    const result = core.input.handleDragMove(toPointerEventData(event), {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      scrollTop: bodyEl.scrollTop,
      scrollLeft: bodyEl.scrollLeft,
    });
    this.deps.onDragStateChange(core.input.getDragState());
    if (result?.autoScroll) {
      this.deps.autoScroll.start(result.autoScroll.dx, result.autoScroll.dy);
    } else {
      this.deps.autoScroll.stop();
    }
  }

  documentPointerMove(event: PointerEvent): boolean {
    const core = this.deps.getCore();
    if (core === null) return false;
    const shouldPreventDefault = core.input.getDragState().isDragging;
    this.deps.autoScroll.recordPointer(event);
    this.dragMove(event);
    return shouldPreventDefault;
  }

  documentPointerUp(): DragEndResult {
    const core = this.deps.getCore();
    if (core === null) return { wasRowDrag: false };
    const wasRowDrag = core.input.getDragState().dragType === "row-drag";
    this.deps.autoScroll.stop();
    this.deps.autoScroll.clearPointer();
    core.input.handleDragEnd();
    this.deps.onDragStateChange(core.input.getDragState());
    return { wasRowDrag };
  }

  wheel(deltaY: number, deltaX: number, dampening: number): { dy: number; dx: number } | null {
    const core = this.deps.getCore();
    if (core === null) return null;
    return core.input.handleWheel(deltaY, deltaX, dampening);
  }

  keyDown(
    event: KeyboardEvent,
    activeCell: CellPosition | null,
    editingCell: { row: number; col: number } | null,
    filterPopupOpen: boolean,
  ): KeyboardResult {
    const core = this.deps.getCore();
    if (core === null) return { preventDefault: false };
    return core.input.handleKeyDown(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      },
      activeCell,
      editingCell,
      filterPopupOpen,
    );
  }

  private dispatchCellDragStart(
    startDrag: InputResult["startDrag"],
    event: PointerEvent,
  ): void {
    const core = this.deps.getCore();
    if (core === null || startDrag === undefined) return;
    if (startDrag === "selection") {
      core.input.startSelectionDrag();
      this.deps.onDragStateChange(core.input.getDragState());
      return;
    }
    if (startDrag === "row-drag") {
      this.deps.onDragStateChange(core.input.getDragState());
      return;
    }
    if (startDrag === "row-drag-pending") {
      this.deps.pendingRowDrag.start(event);
    }
  }
}

const capturePointer = (event: PointerEvent): void => {
  try {
    (event.target as Element).setPointerCapture(event.pointerId);
  } catch (_) {
    /* pointer may have been released */
  }
};

export type { PointerEventData };
