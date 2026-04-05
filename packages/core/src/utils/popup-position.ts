// packages/core/src/utils/popup-position.ts

/**
 * Framework-agnostic popup positioning utility.
 * Calculates the position for a popup element anchored to a header cell,
 * with viewport boundary clamping.
 */

export interface PopupPosition {
  top: number;
  left: number;
  minWidth: number;
}

const DEFAULT_GAP = 4;
const DEFAULT_VIEWPORT_PADDING = 8;

/**
 * Calculate the position for a filter popup anchored below a header cell.
 * Clamps to viewport edges and flips above the header if there is not enough
 * space below.
 */
export const calculateFilterPopupPosition = (
  headerCell: HTMLElement,
  popupEl: HTMLElement,
  viewportPadding: number = DEFAULT_VIEWPORT_PADDING,
): PopupPosition => {
  const rect = headerCell.getBoundingClientRect();
  const popupRect = popupEl.getBoundingClientRect();

  let top = rect.bottom + DEFAULT_GAP;
  let left = rect.left;
  const minWidth = Math.max(200, rect.width);

  // Clamp to viewport right edge
  if (left + popupRect.width > window.innerWidth - viewportPadding) {
    left = window.innerWidth - popupRect.width - viewportPadding;
  }

  // Clamp to viewport left edge
  left = Math.max(viewportPadding, left);

  // If popup would go below viewport, position above header
  if (top + popupRect.height > window.innerHeight - viewportPadding) {
    top = rect.top - popupRect.height - DEFAULT_GAP;
  }

  // Final clamp to top edge
  top = Math.max(viewportPadding, top);

  return { top, left, minWidth };
};
