import type { GridCore } from "../grid-core";
import type { ContainerBounds, PointerEventData } from "../types/input";
import { inlineOffset } from "../adapter/inline-axis";
import { calculateAutoScroll } from "./auto-scroll-util";

export interface CellTarget {
  row: number;
  col: number;
  autoScroll: { dx: number; dy: number } | null;
}

/** Nearest item for a sentinel index; an empty axis has no target (-1). */
const clampItemIndex = (index: number, count: number): number =>
  count === 0 ? -1 : Math.min(Math.max(index, 0), count - 1);

/**
 * Project a pointer position (during a selection/fill drag) onto a cell
 * index plus auto-scroll hints. Shared by selection-drag and fill-drag
 * because both need the same mapping of mouse → (row, col).
 */
export const computeCellTarget = <TData>(
  core: GridCore<TData>,
  event: PointerEventData,
  bounds: ContainerBounds,
): CellTarget => {
  const { top, width, height, scrollTop, scrollLeft } = bounds;
  const headerHeight = core.getHeaderHeight();
  const viewportX = inlineOffset(bounds, event.clientX);

  // `bounds` is the body scroll container: the header sits outside it, so
  // `top` is already the first row's edge.
  const hit = core.geometry.hitTest({
    x: viewportX,
    y: event.clientY - top,
    scrollTop,
    scrollLeft,
  });
  const displayed = core.geometry.getColumnLayout().columns;
  const row = clampItemIndex(hit.row, core.getRowCount());
  const col = displayed[clampItemIndex(hit.displayIndex, displayed.length)]?.layoutIndex ?? -1;

  const autoScroll = calculateAutoScroll(
    event.clientY - top,
    viewportX,
    height,
    width,
    headerHeight,
  );
  return { row, col, autoScroll };
};
