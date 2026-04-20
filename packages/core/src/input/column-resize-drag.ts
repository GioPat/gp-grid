import type { GridCore } from "../grid-core";
import type {
  ColumnResizeDragState,
  ContainerBounds,
  DragMoveResult,
  InputResult,
  PointerEventData,
} from "../types/input";
import {
  AUTO_SCROLL_SPEED,
  AUTO_SCROLL_THRESHOLD,
  DEFAULT_MIN_COLUMN_WIDTH,
} from "./auto-scroll-util";

export class ColumnResizeDrag<TData = unknown> {
  private active = false;
  private colIndex = -1;
  private startX = 0;
  private initialWidth = 0;
  private currentWidth = 0;
  private readonly core: GridCore<TData>;

  constructor(core: GridCore<TData>) {
    this.core = core;
  }

  get isActive(): boolean {
    return this.active;
  }

  start(colIndex: number, colWidth: number, event: PointerEventData): InputResult {
    if (event.button !== 0) {
      return { preventDefault: false, stopPropagation: false };
    }
    const column = this.core.getColumns()[colIndex];
    if (column?.resizable === false) {
      return { preventDefault: false, stopPropagation: false };
    }

    this.active = true;
    this.colIndex = colIndex;
    this.startX = event.clientX;
    this.initialWidth = colWidth;
    this.currentWidth = colWidth;

    return {
      preventDefault: true,
      stopPropagation: true,
      startDrag: "column-resize",
    };
  }

  move(event: PointerEventData, bounds: ContainerBounds): DragMoveResult {
    const column = this.core.getColumns()[this.colIndex];
    const minWidth = column?.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
    const maxWidth = column?.maxWidth;
    let newWidth = this.initialWidth + (event.clientX - this.startX);
    newWidth = Math.max(minWidth, newWidth);
    if (maxWidth !== undefined) {
      newWidth = Math.min(maxWidth, newWidth);
    }
    this.currentWidth = newWidth;

    const mouseXInContainer = event.clientX - bounds.left;
    const scrollDx = mouseXInContainer > bounds.width - AUTO_SCROLL_THRESHOLD
      ? AUTO_SCROLL_SPEED
      : 0;
    const autoScroll = scrollDx === 0 ? null : { dx: scrollDx, dy: 0 };

    return { targetRow: 0, targetCol: this.colIndex, autoScroll };
  }

  end(): void {
    if (this.active) {
      this.core.setColumnWidth(this.colIndex, this.currentWidth);
    }
    this.active = false;
    this.colIndex = -1;
  }

  getState(): ColumnResizeDragState | null {
    if (this.active === false) return null;
    return {
      colIndex: this.colIndex,
      initialWidth: this.initialWidth,
      currentWidth: this.currentWidth,
    };
  }
}
