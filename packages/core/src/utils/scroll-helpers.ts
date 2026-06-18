// packages/core/src/utils/scroll-helpers.ts

import type { SlotData } from "../types/ui-state";

/**
 * Find the slot for a given row index
 */
export const findSlotForRow = (
  slots: Map<string, SlotData>,
  rowIndex: number,
): SlotData | null => {
  for (const slot of slots.values()) {
    if (slot.rowIndex === rowIndex) {
      return slot;
    }
  }
  return null;
};

/**
 * Column geometry needed to scroll a cell horizontally into view.
 * Columns are not scroll-virtualized, so positions map 1:1 to scrollLeft.
 */
export interface ColumnScrollGeometry {
  /** Original column index of the target cell (matches the active cell) */
  colIndex: number;
  /** Visible columns with their original indices, in render order */
  visibleColumns: readonly { originalIndex: number }[];
  /** X positions of visible columns within the scrollable content */
  columnPositions: readonly number[];
  /** Widths of visible columns */
  columnWidths: readonly number[];
}

const scrollRowIntoView = (
  core: { getScrollTopForRow(row: number): number },
  container: HTMLElement,
  row: number,
  rowHeight: number,
  slots: Map<string, SlotData>,
  rowsWrapperOffset: number,
): void => {
  const slot = findSlotForRow(slots, row);

  if (!slot) {
    // No slot for this row — scroll to make it visible at the top
    container.scrollTop = core.getScrollTopForRow(row);
    return;
  }

  // DOM position of the cell within the scrollable content
  const cellDomY = rowsWrapperOffset + slot.translateY;
  const cellViewportTop = cellDomY - container.scrollTop;
  const cellViewportBottom = cellViewportTop + rowHeight;

  if (cellViewportTop < 0) {
    // Cell is above the viewport — scroll up
    container.scrollTop = core.getScrollTopForRow(row);
  } else if (cellViewportBottom > container.clientHeight) {
    // Cell is below the viewport — scroll down so it appears at the bottom
    const rowsInView = Math.floor(container.clientHeight / rowHeight);
    const targetRow = Math.max(0, row - rowsInView + 1);
    container.scrollTop = core.getScrollTopForRow(targetRow);
  }
};

const scrollColumnIntoView = (
  container: HTMLElement,
  geometry: ColumnScrollGeometry,
): void => {
  const visibleIndex = geometry.visibleColumns.findIndex(
    (v) => v.originalIndex === geometry.colIndex,
  );
  const left = geometry.columnPositions[visibleIndex];
  const width = geometry.columnWidths[visibleIndex];
  if (visibleIndex < 0 || left === undefined || width === undefined) return;

  if (left < container.scrollLeft) {
    // Column starts left of the viewport — align it to the left edge
    container.scrollLeft = left;
    return;
  }
  const right = left + width;
  if (right > container.scrollLeft + container.clientWidth) {
    // Column ends right of the viewport — align it to the right edge
    container.scrollLeft = right - container.clientWidth;
  }
};

/**
 * Scroll a cell into view if needed, on both axes.
 *
 * The header is rendered outside the scroll container (flex column layout),
 * so all coordinates are relative to the body scroll container.
 *
 * When scroll virtualization is active, slot.translateY is relative to the
 * first visible row, and the rows wrapper is offset by rowsWrapperOffset.
 * The actual DOM position of a row is: rowsWrapperOffset + slot.translateY.
 *
 * Horizontal scrolling only happens when column geometry is provided; the
 * resulting native scroll event drives header sync and setViewport as usual.
 */
export const scrollCellIntoView = (
  core: { getScrollTopForRow(row: number): number },
  container: HTMLElement,
  row: number,
  rowHeight: number,
  slots: Map<string, SlotData>,
  rowsWrapperOffset: number = 0,
  columns?: ColumnScrollGeometry,
): void => {
  scrollRowIntoView(core, container, row, rowHeight, slots, rowsWrapperOffset);
  if (columns !== undefined) {
    scrollColumnIntoView(container, columns);
  }
};
