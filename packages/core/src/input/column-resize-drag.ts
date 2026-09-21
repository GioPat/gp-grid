import type { GridCore } from "../grid-core";
import type {
  ColumnResizeDragState,
  ContainerBounds,
  DragMoveResult,
  InputResult,
  PointerEventData,
} from "../types/input";
import { AUTO_SCROLL_SPEED, AUTO_SCROLL_THRESHOLD } from "./auto-scroll-util";
import { DEFAULT_MIN_COLUMN_WIDTH } from "../geometry/column-widths";

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
    const autoScroll = this.resizeAutoScroll(mouseXInContainer, bounds.width);

    return { targetRow: 0, targetCol: this.colIndex, autoScroll };
  }

  /**
   * Only center columns can scroll horizontally, and only while the center
   * clip holds more than it shows.
   */
  private resizeAutoScroll(
    mouseXInContainer: number,
    containerWidth: number,
  ): { dx: number; dy: number } | null {
    if (this.isCenterColumn() === false) return null;
    const atEnd = mouseXInContainer > containerWidth - AUTO_SCROLL_THRESHOLD;
    const atStart = mouseXInContainer < AUTO_SCROLL_THRESHOLD;
    if (atEnd === false && atStart === false) return null;
    return { dx: atEnd ? AUTO_SCROLL_SPEED : -AUTO_SCROLL_SPEED, dy: 0 };
  }

  private isCenterColumn(): boolean {
    const layout = this.core.geometry.getColumnLayout();
    const column = layout.columns.find((candidate) => candidate.layoutIndex === this.colIndex);
    return column?.region === "center" && layout.regions.centerViewportWidth > 0;
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
      lineX: this.lineX(),
    };
  }

  /** Viewport-space x of the preview edge: current left plus the ghost width. */
  private lineX(): number {
    const bounds = this.core.geometry.getColumnBounds(this.colIndex, "viewport");
    return (bounds?.start ?? 0) + this.currentWidth;
  }
}
