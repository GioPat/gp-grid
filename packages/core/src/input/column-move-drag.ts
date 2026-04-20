import type { GridCore } from "../grid-core";
import type {
  ColumnMoveDragState,
  ContainerBounds,
  DragMoveResult,
  InputHandlerDeps,
  InputResult,
  PointerEventData,
} from "../types/input";
import type { SortDirection } from "../types";
import { findColumnAtX } from "../utils";
import {
  AUTO_SCROLL_SPEED,
  AUTO_SCROLL_THRESHOLD,
  DRAG_THRESHOLD,
} from "./auto-scroll-util";

export class ColumnMoveDrag<TData = unknown> {
  private active = false;
  private sourceColIndex = -1;
  private startX = 0;
  private startY = 0;
  private thresholdMet = false;
  private shiftKey = false;
  private ghostWidth = 0;
  private ghostHeight = 0;
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

  start(
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

    this.active = true;
    this.sourceColIndex = colIndex;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.thresholdMet = false;
    this.shiftKey = event.shiftKey;
    this.ghostWidth = colWidth;
    this.ghostHeight = colHeight;
    this.currentX = event.clientX;
    this.currentY = event.clientY;
    this.dropTargetIndex = null;

    return {
      preventDefault: true,
      stopPropagation: true,
      startDrag: "column-move",
    };
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

    const { left, width, scrollLeft } = bounds;
    const mouseX = event.clientX - left + scrollLeft;
    const columnPositions = this.deps.getColumnPositions();
    const columnCount = this.deps.getColumnCount();
    this.dropTargetIndex = Math.max(
      0,
      Math.min(findColumnAtX(mouseX, columnPositions), columnCount),
    );

    const mouseXInContainer = event.clientX - left;
    let scrollDx = 0;
    if (mouseXInContainer < AUTO_SCROLL_THRESHOLD) {
      scrollDx = -AUTO_SCROLL_SPEED;
    } else if (mouseXInContainer > width - AUTO_SCROLL_THRESHOLD) {
      scrollDx = AUTO_SCROLL_SPEED;
    }
    const autoScroll = scrollDx === 0 ? null : { dx: scrollDx, dy: 0 };

    return { targetRow: 0, targetCol: this.dropTargetIndex ?? 0, autoScroll };
  }

  end(cycleSortDirection: (current: SortDirection | null | undefined) => SortDirection | null): void {
    if (this.thresholdMet) {
      this.commitMove();
    } else {
      this.treatAsHeaderClick(cycleSortDirection);
    }
    this.reset();
  }

  private commitMove(): void {
    if (this.dropTargetIndex === null) return;
    const fromOriginal = this.sourceColIndex;
    const toOriginal = this.deps.getOriginalColumnIndex
      ? this.deps.getOriginalColumnIndex(
          Math.min(this.dropTargetIndex, this.deps.getColumnCount() - 1),
        )
      : this.dropTargetIndex;
    if (fromOriginal !== toOriginal) {
      this.core.moveColumn(fromOriginal, toOriginal);
    }
  }

  private treatAsHeaderClick(
    cycleSortDirection: (current: SortDirection | null | undefined) => SortDirection | null,
  ): void {
    const column = this.core.getColumns()[this.sourceColIndex];
    if (!column) return;
    const colId = column.colId ?? column.field;
    const currentDirection = this.core
      .getSortModel()
      .find((s) => s.colId === colId)?.direction;
    this.core.setSort(colId, cycleSortDirection(currentDirection), this.shiftKey);
  }

  private reset(): void {
    this.active = false;
    this.sourceColIndex = -1;
    this.thresholdMet = false;
    this.shiftKey = false;
    this.dropTargetIndex = null;
  }

  getState(): ColumnMoveDragState | null {
    if (this.active === false) return null;
    return {
      sourceColIndex: this.sourceColIndex,
      currentX: this.currentX,
      currentY: this.currentY,
      dropTargetIndex: this.dropTargetIndex,
      ghostWidth: this.ghostWidth,
      ghostHeight: this.ghostHeight,
    };
  }
}
