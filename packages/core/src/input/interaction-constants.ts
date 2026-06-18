// Shared pointer-interaction thresholds used by core adapters and wrappers.

/**
 * Maximum pointer travel (px) for a gesture to still count as a tap.
 * Beyond this the gesture is treated as a scroll/drag.
 */
export const TAP_SLOP_PX = 10;

/** Hold duration (ms) required to confirm a row drag on touch devices. */
export const ROW_DRAG_HOLD_MS = 300;
