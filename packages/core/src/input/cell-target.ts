import type { GridCore } from "../grid-core";
import type { ContainerBounds, InputHandlerDeps, PointerEventData } from "../types/input";
import { findColumnAtX } from "../utils";
import { calculateAutoScroll } from "./auto-scroll-util";
import type { ColumnLayoutItem } from "../utils/column-layout";

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
  const columnCount = deps.getColumnCount();

  const viewportY = event.clientY - top;
  const viewportX = event.clientX - left;

  const row = Math.max(
    0,
    Math.min(core.getRowIndexAtDisplayY(viewportY, scrollTop), core.getRowCount() - 1),
  );
  const visibleColIndex = resolveVisibleColumnIndex(deps, viewportX, scrollLeft, width, columnCount);
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

const resolveVisibleColumnIndex = (
  deps: InputHandlerDeps,
  viewportX: number,
  scrollLeft: number,
  viewportWidth: number,
  columnCount: number,
): number => {
  const layout = deps.getColumnLayout?.();
  if (layout) {
    const item = findLayoutItemAtViewportX(layout.items, viewportX, scrollLeft, viewportWidth, layout);
    return Math.max(0, Math.min(item?.visibleIndex ?? 0, columnCount - 1));
  }

  const mouseX = viewportX + scrollLeft;
  return Math.max(
    0,
    Math.min(findColumnAtX(mouseX, deps.getColumnPositions()), columnCount - 1),
  );
};

const findLayoutItemAtViewportX = (
  items: ColumnLayoutItem[],
  viewportX: number,
  scrollLeft: number,
  viewportWidth: number,
  layout: NonNullable<ReturnType<NonNullable<InputHandlerDeps["getColumnLayout"]>>>,
): ColumnLayoutItem | undefined => {
  const rightStart = viewportWidth - layout.rightPinnedWidth;
  if (viewportX < layout.leftPinnedWidth) {
    return findItemAtX(layout.leftPinned.items, viewportX);
  }
  if (viewportX >= rightStart) {
    return findItemAtX(layout.rightPinned.items, viewportX - rightStart);
  }
  return findItemAtX(layout.center.items, viewportX - layout.leftPinnedWidth + scrollLeft) ??
    items.at(-1);
};

const findItemAtX = (
  items: ColumnLayoutItem[],
  x: number,
): ColumnLayoutItem | undefined =>
  items.find((item) => x >= item.left && x < item.left + item.width) ?? items.at(-1);
