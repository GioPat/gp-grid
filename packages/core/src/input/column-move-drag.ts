import type { GridCore } from "../grid-core";
import type {
  ColumnMoveDragState,
  ContainerBounds,
  DragMoveResult,
  InputResult,
  PointerEventData,
} from "../types/input";
import type { SortDirection } from "../types";
import { AUTO_SCROLL_SPEED, AUTO_SCROLL_THRESHOLD } from "./auto-scroll-util";
import { inlineOffset } from "../adapter/inline-axis";
import { DragGesture } from "./drag-gesture";

export class ColumnMoveDrag<TData = unknown> {
  private readonly gesture = new DragGesture();
  private sourceColIndex = -1;
  private shiftKey = false;
  private ghostWidth = 0;
  private ghostHeight = 0;
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

    const { width, scrollLeft } = bounds;
    const layout = this.core.geometry.getColumnLayout();
    const viewportX = inlineOffset(bounds, event.clientX);
    const hit = this.core.geometry.hitTest({
      x: viewportX,
      y: event.clientY - bounds.top,
      scrollLeft,
    });
    // A displayed-column index; past the last column is the end insertion edge.
    const dropTargetIndex = Math.max(0, Math.min(hit.displayIndex, layout.columns.length));
    this.gesture.dropTargetIndex = dropTargetIndex;

    const autoScroll = this.moveAutoScroll(viewportX, width);

    return { targetRow: 0, targetCol: dropTargetIndex, autoScroll };
  }

  /** Horizontal auto-scroll applies only inside the scrolling center clip. */
  private moveAutoScroll(
    mouseXInContainer: number,
    containerWidth: number,
  ): { dx: number; dy: number } | null {
    const layout = this.core.geometry.getColumnLayout();
    const source = layout.columns.find(
      (column) => column.layoutIndex === this.sourceColIndex,
    );
    if (source?.region !== "center" || layout.regions.centerViewportWidth <= 0) return null;
    if (mouseXInContainer < AUTO_SCROLL_THRESHOLD) {
      return { dx: -AUTO_SCROLL_SPEED, dy: 0 };
    }
    if (mouseXInContainer > containerWidth - AUTO_SCROLL_THRESHOLD) {
      return { dx: AUTO_SCROLL_SPEED, dy: 0 };
    }
    return null;
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
    // The drop target indexes the displayed columns; `moveColumn` takes
    // layout indices, which differ once a column is hidden.
    const displayed = this.core.geometry.getColumnLayout().columns;
    const toIndex = displayed[Math.min(dropTargetIndex, displayed.length - 1)]?.layoutIndex;
    if (toIndex === undefined) return;
    const fromIndex = this.sourceColIndex;
    if (fromIndex !== toIndex) {
      this.core.moveColumn(fromIndex, toIndex);
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
      dropIndicatorX: this.dropIndicatorX(dropTargetIndex),
    };
  }

  /** Viewport-space x of the drop indicator, or the end edge of the layout. */
  private dropIndicatorX(dropTargetIndex: number | null): number {
    if (dropTargetIndex === null) return 0;
    const layout = this.core.geometry.getColumnLayout();
    const column = layout.columns[dropTargetIndex];
    if (column === undefined) {
      return this.core.geometry.getColumnBounds(
        layout.columns.at(-1)?.layoutIndex ?? -1,
        "viewport",
      )?.end ?? layout.totalWidth;
    }
    return this.core.geometry.getColumnBounds(column.layoutIndex, "viewport")?.start
      ?? column.offset;
  }
}
