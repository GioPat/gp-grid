import type { GridCore } from "../grid-core";
import type {
  ContainerBounds,
  DragMoveResult,
  PointerEventData,
  RowDragState,
} from "../types/input";
import { calculateAutoScroll } from "./auto-scroll-util";
import { DragGesture } from "./drag-gesture";

export class RowDrag<TData = unknown> {
  private readonly gesture = new DragGesture();
  private sourceRowIndex = -1;
  private readonly core: GridCore<TData>;

  constructor(core: GridCore<TData>) {
    this.core = core;
  }

  get isActive(): boolean {
    return this.gesture.active;
  }

  get isDraggingForDisplay(): boolean {
    return this.gesture.isDraggingForDisplay;
  }

  start(sourceRowIndex: number, clientX: number, clientY: number): void {
    this.sourceRowIndex = sourceRowIndex;
    this.gesture.begin(clientX, clientY);
  }

  move(event: PointerEventData, bounds: ContainerBounds): DragMoveResult | null {
    if (this.gesture.track(event) === false) return null;

    const { top, left, height, width, scrollTop } = bounds;
    const headerHeight = this.core.getHeaderHeight();
    // `bounds` is the body scroll container, which starts below the header.
    const viewportY = event.clientY - top;
    const rowCount = this.core.getRowCount();

    // The insertion edge includes `rowCount` (drop after the final row).
    const hit = this.core.geometry.hitTest({ x: 0, y: viewportY, scrollTop });
    const targetRow = Math.max(0, Math.min(hit.row, rowCount));
    this.gesture.dropTargetIndex = targetRow;

    const autoScroll = calculateAutoScroll(
      event.clientY - top,
      event.clientX - left,
      height,
      width,
      headerHeight,
    );

    return { targetRow, targetCol: 0, autoScroll };
  }

  end(): void {
    const { thresholdMet, dropTargetIndex } = this.gesture;
    if (thresholdMet && dropTargetIndex !== null && dropTargetIndex !== this.sourceRowIndex) {
      this.core.commitRowDrag(this.sourceRowIndex, dropTargetIndex);
    }
    this.sourceRowIndex = -1;
    this.gesture.reset();
  }

  getState(): RowDragState | null {
    if (this.gesture.active === false) return null;
    const { currentX, currentY, dropTargetIndex } = this.gesture;
    return {
      sourceRowIndex: this.sourceRowIndex,
      currentX,
      currentY,
      dropTargetIndex,
      dropIndicatorY: dropTargetIndex === null
        ? 0
        : this.core.geometry.getRowEdgeOffset(dropTargetIndex, "rows") ?? 0,
    };
  }
}
