// WheelEvent.deltaMode values.
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** Pixels per wheel line and page, the conventional line-mode (Firefox) equivalents. */
export const WHEEL_LINE_PX = 40;
export const WHEEL_PAGE_PX = 800;

/** A wheel delta in pixels whatever unit the browser reported it in. */
export const wheelDeltaToPx = (delta: number, deltaMode: number): number => {
  if (deltaMode === DOM_DELTA_LINE) return delta * WHEEL_LINE_PX;
  if (deltaMode === DOM_DELTA_PAGE) return delta * WHEEL_PAGE_PX;
  return delta;
};
