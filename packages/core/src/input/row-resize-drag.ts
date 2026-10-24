import type { GridCore } from "../grid-core";
import type { RowId } from "../types/basic";
import type {
  DragMoveResult,
  InputResult,
  PointerEventData,
  RowResizeDragState,
} from "../types/input";

/** Shortest height a row resize gesture sets. */
export const MIN_ROW_RESIZE_HEIGHT = 16;

/** Row gesture commands that report their change through `onRowResized`. */
export interface RowResizeCommands {
  /** Tallest height a row gesture sets: `autoFit.maxRowHeight`. */
  readonly maxRowHeight: number;
  /** Set one row's height. */
  resizeRow(viewIndex: number, height: number): void;
}

/** Clamp into `[MIN_ROW_RESIZE_HEIGHT, maxRowHeight]`; the maximum wins. */
export const clampRowHeight = (height: number, maxRowHeight: number): number =>
  Math.min(maxRowHeight, Math.max(MIN_ROW_RESIZE_HEIGHT, height));

const IGNORED: InputResult = { preventDefault: false, stopPropagation: false };

/** Drag of a row's bottom edge; mirrors `ColumnResizeDrag` without auto-scroll. */
export class RowResizeDrag<TData = unknown> {
  private active = false;
  private rowIndex = -1;
  private rowId: RowId = -1;
  private startY = 0;
  private initialHeight = 0;
  private currentHeight = 0;
  private readonly core: GridCore<TData>;
  private readonly commands: RowResizeCommands;

  constructor(core: GridCore<TData>, commands: RowResizeCommands) {
    this.core = core;
    this.commands = commands;
  }

  get isActive(): boolean {
    return this.active;
  }

  start(rowIndex: number, rowHeight: number, event: PointerEventData): InputResult {
    if (event.button !== 0) return IGNORED;
    const rowId = this.core.rows.getViewRow(rowIndex)?.id;
    if (rowId === undefined) return IGNORED;

    this.active = true;
    this.rowIndex = rowIndex;
    this.rowId = rowId;
    this.startY = event.clientY;
    this.initialHeight = rowHeight;
    this.currentHeight = rowHeight;

    return { preventDefault: true, stopPropagation: true, startDrag: "row-resize" };
  }

  move(event: PointerEventData): DragMoveResult {
    const dragged = event.clientY - this.startY;
    this.currentHeight = clampRowHeight(this.initialHeight + dragged, this.commands.maxRowHeight);
    return { targetRow: this.rowIndex, targetCol: 0, autoScroll: null };
  }

  /** A press that never changed the height commits nothing and fires no event. */
  end(): void {
    if (this.active && this.currentHeight !== this.initialHeight) {
      this.commands.resizeRow(this.rowIndex, this.currentHeight);
    }
    this.active = false;
    this.rowIndex = -1;
  }

  getState(): RowResizeDragState | null {
    if (this.active === false) return null;
    const { geometry } = this.core;
    const top = geometry.getRowBounds(this.rowIndex, "viewport")?.start ?? 0;
    const frozen = this.rowIndex < geometry.getRowRegions().frozenCount;
    return {
      rowIndex: this.rowIndex,
      rowId: this.rowId,
      initialHeight: this.initialHeight,
      currentHeight: this.currentHeight,
      lineY: top + this.currentHeight,
      region: frozen ? "frozen" : "suffix",
    };
  }
}
