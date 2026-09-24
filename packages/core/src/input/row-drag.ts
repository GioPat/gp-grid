import type { GridCore } from "../grid-core";
import type {
  ContainerBounds,
  DragMoveResult,
  PointerEventData,
  RowDragState,
} from "../types/input";
import type { GeometrySpace, GridGeometry, RowRegion } from "../types/geometry";
import { calculateAutoScroll } from "./auto-scroll-util";
import { inlineOffset } from "../adapter/inline-axis";
import { DragGesture } from "./drag-gesture";

/**
 * The insertion edge at `frozenCount` is the last frozen row's bottom edge:
 * the first suffix row's top edge can sit under the block (C10).
 */
const resolveDropIndicatorRegion = (
  dropTargetIndex: number | null,
  frozenCount: number,
): RowRegion => {
  const insideFrozenBand = dropTargetIndex !== null && dropTargetIndex <= frozenCount;
  return frozenCount > 0 && insideFrozenBand ? "frozen" : "suffix";
};

/**
 * A frozen indicator renders inside the block, whose space is the content
 * offset; `rows` space anchors a boundary index to the compressed suffix
 * anchor, which can sit far below row 3.
 */
const resolveDropIndicatorY = (
  geometry: GridGeometry,
  dropTargetIndex: number | null,
  region: RowRegion,
): number => {
  if (dropTargetIndex === null) return 0;
  const space: GeometrySpace = region === "frozen" ? "content" : "rows";
  return geometry.getRowEdgeOffset(dropTargetIndex, space) ?? 0;
};

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

    const { top, height, width, scrollTop } = bounds;
    // `bounds` is the body scroll container, which starts below the header.
    const viewportY = event.clientY - top;
    const rowCount = this.core.rows.getCount();

    // The insertion edge includes `rowCount` (drop after the final row).
    const hit = this.core.geometry.hitTest({ x: 0, y: viewportY, scrollTop });
    const targetRow = Math.max(0, Math.min(hit.row, rowCount));
    this.gesture.dropTargetIndex = targetRow;

    const { region, limits } = this.core.geometry.getRowScrollEdges(scrollTop, height);
    const autoScroll = calculateAutoScroll(
      viewportY,
      inlineOffset(bounds, event.clientX),
      height,
      width,
      region,
      limits,
    );

    return { targetRow, targetCol: 0, autoScroll };
  }

  end(): void {
    const { thresholdMet, dropTargetIndex } = this.gesture;
    if (thresholdMet && dropTargetIndex !== null && dropTargetIndex !== this.sourceRowIndex) {
      this.core.rowDrag.commit(this.sourceRowIndex, dropTargetIndex);
    }
    this.sourceRowIndex = -1;
    this.gesture.reset();
  }

  getState(): RowDragState | null {
    if (this.gesture.active === false) return null;
    const { currentX, currentY, dropTargetIndex } = this.gesture;
    const { geometry } = this.core;
    const frozenCount = geometry.getRowRegions().frozenCount;
    const dropIndicatorRegion = resolveDropIndicatorRegion(dropTargetIndex, frozenCount);
    return {
      sourceRowIndex: this.sourceRowIndex,
      currentX,
      currentY,
      dropTargetIndex,
      dropIndicatorRegion,
      dropIndicatorY: resolveDropIndicatorY(geometry, dropTargetIndex, dropIndicatorRegion),
    };
  }
}
