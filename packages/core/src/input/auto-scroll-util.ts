export const AUTO_SCROLL_THRESHOLD = 40;
export const AUTO_SCROLL_SPEED = 10;
export const DRAG_THRESHOLD = 5;
export const DEFAULT_MIN_COLUMN_WIDTH = 50;

export const calculateAutoScroll = (
  mouseYInContainer: number,
  mouseXInContainer: number,
  containerHeight: number,
  containerWidth: number,
  headerHeight: number,
): { dx: number; dy: number } | null => {
  let dx = 0;
  let dy = 0;

  if (mouseYInContainer < AUTO_SCROLL_THRESHOLD + headerHeight) {
    dy = -AUTO_SCROLL_SPEED;
  } else if (mouseYInContainer > containerHeight - AUTO_SCROLL_THRESHOLD) {
    dy = AUTO_SCROLL_SPEED;
  }

  if (mouseXInContainer < AUTO_SCROLL_THRESHOLD) {
    dx = -AUTO_SCROLL_SPEED;
  } else if (mouseXInContainer > containerWidth - AUTO_SCROLL_THRESHOLD) {
    dx = AUTO_SCROLL_SPEED;
  }

  return dx !== 0 || dy !== 0 ? { dx, dy } : null;
};
