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
 * Scroll a cell into view if needed
 */
export const scrollCellIntoView = (
  core: { getScrollTopForRow(row: number): number },
  container: HTMLDivElement,
  row: number,
  rowHeight: number,
  headerHeight: number,
  slots: Map<string, SlotData>,
): void => {
  const slot = findSlotForRow(slots, row);
  const cellTranslateY = slot ? slot.translateY : headerHeight + row * rowHeight;
  const cellViewportTop = cellTranslateY - container.scrollTop;
  const cellViewportBottom = cellViewportTop + rowHeight;
  const visibleTop = headerHeight;
  const visibleBottom = container.clientHeight;

  if (cellViewportTop < visibleTop) {
    container.scrollTop = core.getScrollTopForRow(row);
  } else if (cellViewportBottom > visibleBottom) {
    const visibleDataHeight = container.clientHeight - headerHeight;
    const rowsInView = Math.floor(visibleDataHeight / rowHeight);
    const targetRow = Math.max(0, row - rowsInView + 1);
    container.scrollTop = core.getScrollTopForRow(targetRow);
  }
};
