import type { GridCore } from "../grid-core";
import type {
  ContainerBounds,
  DragMoveResult,
  InputHandlerDeps,
  PointerEventData,
  RowDragState,
} from "../types/input";
import {
  DRAG_THRESHOLD,
  calculateAutoScroll,
} from "./auto-scroll-util";

export class RowDrag<TData = unknown> {
  private active = false;
  private sourceRowIndex = -1;
  private startX = 0;
  private startY = 0;
  private thresholdMet = false;
  private currentX = 0;
  private currentY = 0;
  private dropTargetIndex: number | null = null;
  private readonly core: GridCore<TData>;
  private deps: InputHandlerDeps;

  constructor(core: GridCore<TData>, deps: InputHandlerDeps) {
    this.core = core;
    this.deps = deps;
  }

  updateDeps(deps: InputHandlerDeps): void {
    this.deps = deps;
  }

  get isActive(): boolean {
    return this.active;
  }

  get isDraggingForDisplay(): boolean {
    return this.active && this.thresholdMet;
  }

  start(sourceRowIndex: number, clientX: number, clientY: number): void {
    this.active = true;
    this.sourceRowIndex = sourceRowIndex;
    this.startX = clientX;
    this.startY = clientY;
    this.thresholdMet = false;
    this.currentX = clientX;
    this.currentY = clientY;
    this.dropTargetIndex = null;
  }

  move(event: PointerEventData, bounds: ContainerBounds): DragMoveResult | null {
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (this.thresholdMet === false) {
      const thresholdCrossed = Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
      if (thresholdCrossed === false) return null;
      this.thresholdMet = true;
    }

    this.currentX = event.clientX;
    this.currentY = event.clientY;

    const { top, left, height, width, scrollTop } = bounds;
    const headerHeight = this.deps.getHeaderHeight();
    const viewportY = event.clientY - top;
    const rowCount = this.core.getRowCount();

    const hoveredRow = Math.max(
      0,
      Math.min(this.core.getRowIndexAtDisplayY(viewportY, scrollTop), rowCount),
    );
    const targetRow = hoveredRow > this.sourceRowIndex
      ? Math.min(hoveredRow + 1, rowCount)
      : hoveredRow;
    this.dropTargetIndex = targetRow;

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
    if (this.thresholdMet && this.dropTargetIndex !== null) {
      if (this.dropTargetIndex !== this.sourceRowIndex) {
        this.core.commitRowDrag(this.sourceRowIndex, this.dropTargetIndex);
      }
    }
    this.active = false;
    this.sourceRowIndex = -1;
    this.thresholdMet = false;
    this.dropTargetIndex = null;
  }

  getState(): RowDragState | null {
    if (this.active === false) return null;
    return {
      sourceRowIndex: this.sourceRowIndex,
      currentX: this.currentX,
      currentY: this.currentY,
      dropTargetIndex: this.dropTargetIndex,
      dropIndicatorY: this.dropTargetIndex === null
        ? 0
        : this.core.getRowTranslateY(this.dropTargetIndex),
    };
  }
}
