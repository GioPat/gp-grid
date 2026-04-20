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
 * Scroll a cell into view if needed.
 *
 * The header is rendered outside the scroll container (flex column layout),
 * so all coordinates are relative to the body scroll container.
 *
 * When scroll virtualization is active, slot.translateY is relative to the
 * first visible row, and the rows wrapper is offset by rowsWrapperOffset.
 * The actual DOM position of a row is: rowsWrapperOffset + slot.translateY.
 */
export const scrollCellIntoView = (
  core: { getScrollTopForRow(row: number): number },
  container: HTMLElement,
  row: number,
  rowHeight: number,
  slots: Map<string, SlotData>,
  rowsWrapperOffset: number = 0,
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
