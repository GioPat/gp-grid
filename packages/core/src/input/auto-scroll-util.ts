export const AUTO_SCROLL_THRESHOLD = 40;
export const AUTO_SCROLL_SPEED = 10;
export const DRAG_THRESHOLD = 5;

/** C11 vertical zones: the frozen band edge plus the scrolling suffix clip. */
export interface AutoScrollRegion {
  /** Body-relative y where the frozen band ends; the suffix clip starts. */
  readonly frozenExtent: number;
  /** Body height the suffix scrolls in; zero disables vertical auto-scroll. */
  readonly suffixViewportHeight: number;
}

/** Vertical step limits in DOM scroll space. */
export interface AutoScrollLimits {
  /** Current scroll top; the up step is suppressed at or below zero. */
  readonly scrollTop: number;
  /** Largest reachable scroll top; the down step is suppressed at or above it. */
  readonly maxScrollTop: number;
}

const verticalDelta = (
  viewportY: number,
  containerHeight: number,
  region: AutoScrollRegion,
  limits: AutoScrollLimits,
): number => {
  // An empty suffix, a block-only body or an axis with nothing to scroll has
  // no vertical direction at all; the horizontal axis stays independent.
  if (region.suffixViewportHeight <= 0) return 0;
  if (limits.maxScrollTop <= 0) return 0;
  // Strict: when the zones meet at the midpoint the answer is neutral, so a
  // 64 px suffix has two 32 px zones and one neutral midpoint.
  const edge = Math.min(AUTO_SCROLL_THRESHOLD, region.suffixViewportHeight / 2);
  if (viewportY < region.frozenExtent + edge) {
    return limits.scrollTop <= 0 ? 0 : -AUTO_SCROLL_SPEED;
  }
  if (viewportY > containerHeight - edge) {
    return limits.scrollTop >= limits.maxScrollTop ? 0 : AUTO_SCROLL_SPEED;
  }
  return 0;
};

const horizontalDelta = (viewportX: number, containerWidth: number): number => {
  if (viewportX < AUTO_SCROLL_THRESHOLD) return -AUTO_SCROLL_SPEED;
  if (viewportX > containerWidth - AUTO_SCROLL_THRESHOLD) return AUTO_SCROLL_SPEED;
  return 0;
};

/**
 * Auto-scroll hints for a pointer drag. `viewportY` is body-relative and
 * already excludes the header, so the top zone is the region edge alone.
 * Null when neither axis wants to move.
 */
export const calculateAutoScroll = (
  viewportY: number,
  viewportX: number,
  containerHeight: number,
  containerWidth: number,
  region: AutoScrollRegion,
  limits: AutoScrollLimits,
): { dx: number; dy: number } | null => {
  const dy = verticalDelta(viewportY, containerHeight, region, limits);
  const dx = horizontalDelta(viewportX, containerWidth);
  return dx !== 0 || dy !== 0 ? { dx, dy } : null;
};
