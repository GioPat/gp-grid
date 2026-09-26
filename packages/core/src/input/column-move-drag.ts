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
    const column = this.core.columns.get()[colIndex];
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
    // Keep hit-testing inside the client box. A pointer captured beyond an
    // edge may overlap mounted overscan columns, but those are not drop targets
    // until auto-scroll brings them into view.
    const targetX = Math.max(0, Math.min(viewportX, Math.max(0, width - 1)));
    const hit = this.core.geometry.hitTest({
      x: targetX,
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
      this.core.columns.move(fromIndex, toIndex);
    }
  }

  private treatAsHeaderClick(
    cycleSortDirection: (current: SortDirection | null | undefined) => SortDirection | null,
  ): void {
    const column = this.core.columns.get()[this.sourceColIndex];
    if (!column) return;
    const colId = column.colId ?? column.field;
    const currentDirection = this.core
      .sortFilter.getSortModel()
      .find((s) => s.colId === colId)?.direction;
    this.core.sortFilter.setSort(colId, cycleSortDirection(currentDirection), this.shiftKey);
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

  /** Viewport-space x of the drop indicator, clamped to its region's clip. */
  private dropIndicatorX(dropTargetIndex: number | null): number {
    if (dropTargetIndex === null) return 0;
    const layout = this.core.geometry.getColumnLayout();
    const column = layout.columns[dropTargetIndex];
    const target = column ?? layout.columns.at(-1);
    if (target === undefined) return 0;

    const bounds = this.core.geometry.getColumnBounds(target.layoutIndex, "viewport");
    const edge = column === undefined ? bounds?.end : bounds?.start;
    const fallback = column === undefined ? layout.totalWidth : target.offset;
    const position = edge ?? fallback;
    const clip = this.core.geometry.getColumnClip(target.layoutIndex);
    if (clip === undefined) return position;
    return Math.max(clip.start, Math.min(position, clip.end));
  }
}
