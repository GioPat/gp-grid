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
} from "./auto-scroll-util";
import { DragGesture } from "./drag-gesture";

export class ColumnMoveDrag<TData = unknown> {
  private readonly gesture = new DragGesture();
  private sourceColIndex = -1;
  private shiftKey = false;
  private ghostWidth = 0;
  private ghostHeight = 0;
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
    return this.gesture.active;
  }

  get isDraggingForDisplay(): boolean {
    return this.gesture.isDraggingForDisplay;
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

    this.sourceColIndex = colIndex;
    this.shiftKey = event.shiftKey;
    this.ghostWidth = colWidth;
    this.ghostHeight = colHeight;
    this.gesture.begin(event.clientX, event.clientY);

    return {
      preventDefault: true,
      stopPropagation: true,
      startDrag: "column-move",
    };
  }

  move(event: PointerEventData, bounds: ContainerBounds): DragMoveResult | null {
    if (this.gesture.track(event) === false) return null;

    const { left, width, scrollLeft } = bounds;
    const mouseX = event.clientX - left + scrollLeft;
    const columnPositions = this.deps.getColumnPositions();
    const columnCount = this.deps.getColumnCount();
    const dropTargetIndex = Math.max(
      0,
      Math.min(findColumnAtX(mouseX, columnPositions), columnCount),
    );
    this.gesture.dropTargetIndex = dropTargetIndex;

    const mouseXInContainer = event.clientX - left;
    let scrollDx = 0;
    if (mouseXInContainer < AUTO_SCROLL_THRESHOLD) {
      scrollDx = -AUTO_SCROLL_SPEED;
    } else if (mouseXInContainer > width - AUTO_SCROLL_THRESHOLD) {
      scrollDx = AUTO_SCROLL_SPEED;
    }
    const autoScroll = scrollDx === 0 ? null : { dx: scrollDx, dy: 0 };

    return { targetRow: 0, targetCol: dropTargetIndex, autoScroll };
  }

  end(cycleSortDirection: (current: SortDirection | null | undefined) => SortDirection | null): void {
    if (this.gesture.thresholdMet) {
      this.commitMove();
    } else {
      this.treatAsHeaderClick(cycleSortDirection);
    }
    this.reset();
  }

  private commitMove(): void {
    const { dropTargetIndex } = this.gesture;
    if (dropTargetIndex === null) return;
    const fromOriginal = this.sourceColIndex;
    const toOriginal = this.deps.getOriginalColumnIndex
      ? this.deps.getOriginalColumnIndex(
          Math.min(dropTargetIndex, this.deps.getColumnCount() - 1),
        )
      : dropTargetIndex;
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
    this.sourceColIndex = -1;
    this.shiftKey = false;
    this.gesture.reset();
  }

  getState(): ColumnMoveDragState | null {
    if (this.gesture.active === false) return null;
    const { currentX, currentY, dropTargetIndex } = this.gesture;
    return {
      sourceColIndex: this.sourceColIndex,
      currentX,
      currentY,
      dropTargetIndex,
      ghostWidth: this.ghostWidth,
      ghostHeight: this.ghostHeight,
    };
  }
}
