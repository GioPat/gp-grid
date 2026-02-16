// packages/core/src/types/input.ts
// Framework-agnostic input types for InputHandler

import type { CellPosition, CellRange } from "./basic";

// =============================================================================
// Event Data Types (framework-agnostic)
// =============================================================================

/** Framework-agnostic pointer/mouse event data */
export interface PointerEventData {
  /** X coordinate relative to viewport */
  clientX: number;
  /** Y coordinate relative to viewport */
  clientY: number;
  /** Mouse button (0 = left, 1 = middle, 2 = right) */
  button: number;
  /** Whether Shift key is pressed */
  shiftKey: boolean;
  /** Whether Ctrl key is pressed */
  ctrlKey: boolean;
  /** Whether Meta/Command key is pressed */
  metaKey: boolean;
}

/** Framework-agnostic keyboard event data */
export interface KeyEventData {
  /** Key value (e.g., 'Enter', 'ArrowUp', 'a') */
  key: string;
  /** Whether Shift key is pressed */
  shiftKey: boolean;
  /** Whether Ctrl key is pressed */
  ctrlKey: boolean;
  /** Whether Meta/Command key is pressed */
  metaKey: boolean;
}

/** Container bounds and scroll position */
export interface ContainerBounds {
  /** Top position relative to viewport */
  top: number;
  /** Left position relative to viewport */
  left: number;
  /** Container width */
  width: number;
  /** Container height */
  height: number;
  /** Current scroll top position */
  scrollTop: number;
  /** Current scroll left position */
  scrollLeft: number;
}

// =============================================================================
// Result Types (what framework should do)
// =============================================================================

/** Result from mouse/pointer input handlers */
export interface InputResult {
  /** Whether to call preventDefault() on the event */
  preventDefault: boolean;
  /** Whether to call stopPropagation() on the event */
  stopPropagation: boolean;
  /** Whether framework should focus the container element */
  focusContainer?: boolean;
  /** Type of drag operation to start (framework manages global listeners) */
  startDrag?: "selection" | "fill" | "column-resize" | "column-move" | "row-drag";
}

/** Result from keyboard input handler */
export interface KeyboardResult {
  /** Whether to call preventDefault() on the event */
  preventDefault: boolean;
  /** Cell to scroll into view (if navigation occurred) */
  scrollToCell?: CellPosition;
}

/** Result from drag move handler */
export interface DragMoveResult {
  /** Target row index */
  targetRow: number;
  /** Target column index */
  targetCol: number;
  /** Auto-scroll deltas (null if no auto-scroll needed) */
  autoScroll: { dx: number; dy: number } | null;
}

// =============================================================================
// InputHandler Options
// =============================================================================

/** Options for InputHandler constructor */
export interface InputHandlerDeps {
  /** Get header height */
  getHeaderHeight: () => number;
  /** Get row height */
  getRowHeight: () => number;
  /** Get column positions array (indexed by visible column) */
  getColumnPositions: () => number[];
  /** Get visible column count */
  getColumnCount: () => number;
  /**
   * Convert visible column index to original column index.
   * Used when columns can be hidden. Returns the original index for selection tracking.
   * If not provided, visible index is used directly (no hidden columns).
   */
  getOriginalColumnIndex?: (visibleIndex: number) => number;
  /** Get column widths array (indexed by visible column) */
  getColumnWidths?: () => number[];
}

// =============================================================================
// Drag State (exposed for UI rendering)
// =============================================================================

/** Column resize drag state */
export interface ColumnResizeDragState {
  colIndex: number;
  initialWidth: number;
  currentWidth: number;
}

/** Column move drag state */
export interface ColumnMoveDragState {
  sourceColIndex: number;
  currentX: number;
  currentY: number;
  dropTargetIndex: number | null;
  ghostWidth: number;
  ghostHeight: number;
}

/** Row drag state */
export interface RowDragState {
  sourceRowIndex: number;
  currentX: number;
  currentY: number;
  dropTargetIndex: number | null;
  /** Pre-computed translateY for the drop indicator inside the rows wrapper */
  dropIndicatorY: number;
}

/** Current drag state for UI rendering */
export interface DragState {
  /** Whether any drag operation is active */
  isDragging: boolean;
  /** Type of active drag operation */
  dragType: "selection" | "fill" | "column-resize" | "column-move" | "row-drag" | null;
  /** Source range for fill operations */
  fillSourceRange: CellRange | null;
  /** Current fill target position */
  fillTarget: { row: number; col: number } | null;
  /** Column resize state (when dragType is "column-resize") */
  columnResize: ColumnResizeDragState | null;
  /** Column move state (when dragType is "column-move") */
  columnMove: ColumnMoveDragState | null;
  /** Row drag state (when dragType is "row-drag") */
  rowDrag: RowDragState | null;
}
