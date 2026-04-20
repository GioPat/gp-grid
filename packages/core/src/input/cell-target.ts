import type { GridCore } from "../grid-core";
import type { ContainerBounds, InputHandlerDeps, PointerEventData } from "../types/input";
import { findColumnAtX } from "../utils";
import { calculateAutoScroll } from "./auto-scroll-util";

export interface CellTarget {
  row: number;
  col: number;
  autoScroll: { dx: number; dy: number } | null;
}

/**
 * Project a pointer position (during a selection/fill drag) onto a cell
 * index plus auto-scroll hints. Shared by selection-drag and fill-drag
 * because both need the same mapping of mouse → (row, col).
 */
export const computeCellTarget = <TData>(
  core: GridCore<TData>,
  deps: InputHandlerDeps,
  event: PointerEventData,
  bounds: ContainerBounds,
): CellTarget => {
  const { top, left, width, height, scrollTop, scrollLeft } = bounds;
  const columnPositions = deps.getColumnPositions();
  const columnCount = deps.getColumnCount();

  const viewportY = event.clientY - top;
  const mouseX = event.clientX - left + scrollLeft;

  const row = Math.max(
    0,
    Math.min(core.getRowIndexAtDisplayY(viewportY, scrollTop), core.getRowCount() - 1),
  );
  const visibleColIndex = Math.max(
    0,
    Math.min(findColumnAtX(mouseX, columnPositions), columnCount - 1),
  );
  const col = deps.getOriginalColumnIndex
    ? deps.getOriginalColumnIndex(visibleColIndex)
    : visibleColIndex;

  const autoScroll = calculateAutoScroll(
    event.clientY - top,
    event.clientX - left,
    height,
    width,
    deps.getHeaderHeight(),
  );
  return { row, col, autoScroll };
};
