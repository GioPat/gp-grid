// Touch gesture bookkeeping for synthetic scrolling. Pure functions over a
// mutable GestureState so the controller only wires events to them.

import { TAP_SLOP_PX } from "../input/interaction-constants";
import type { VelocitySample } from "../utils/touch-scroll-physics";
import { clamp } from "./touch-scroll-helpers";

/** Structural touch shapes so tests can dispatch plain Events. */
export interface TouchPointLike {
  identifier: number;
  clientX: number;
  clientY: number;
}

export interface TouchEventLike extends Event {
  touches: ArrayLike<TouchPointLike | undefined>;
  changedTouches: ArrayLike<TouchPointLike | undefined>;
}

export interface DragTarget {
  top: number;
  left: number;
}

export interface GestureState {
  touchId: number;
  startClientX: number;
  startClientY: number;
  baseScrollTop: number;
  baseScrollLeft: number;
  engaged: boolean;
  slopOffsetX: number;
  slopOffsetY: number;
  samples: VelocitySample[];
  /** Fling velocity still alive when this gesture caught the content */
  carriedVelocity: number;
  /**
   * The scroll position the controller last wrote (or found at gesture
   * start). If the element drifts away from it, a native scroller is also
   * driving the gesture and the controller must back off.
   */
  expectedScrollTop: number;
  expectedScrollLeft: number;
}

/**
 * Scroll-position drift (px) beyond which a native scroller must be driving
 * the element. Our own writes only diverge from the read-back value by
 * browser rounding (< 2px); a native pan moves the element by whole finger
 * deltas between our frames, so it crosses this within an event or two.
 */
const NATIVE_SCROLL_DRIFT_PX = 4;

export const createGestureState = (
  touch: TouchPointLike,
  el: HTMLElement,
  timeStamp: number,
  carriedVelocity: number,
): GestureState => ({
  touchId: touch.identifier,
  startClientX: touch.clientX,
  startClientY: touch.clientY,
  baseScrollTop: el.scrollTop,
  baseScrollLeft: el.scrollLeft,
  engaged: false,
  slopOffsetX: 0,
  slopOffsetY: 0,
  samples: [{ time: timeStamp, position: 0 }],
  carriedVelocity,
  expectedScrollTop: el.scrollTop,
  expectedScrollLeft: el.scrollLeft,
});

/** The changed touch belonging to the tracked gesture, if it is in the event. */
export const findTrackedTouch = (
  gesture: GestureState,
  event: Event,
): TouchPointLike | null => {
  const touches = Array.from((event as TouchEventLike).changedTouches);
  return touches.find((touch) => touch?.identifier === gesture.touchId) ?? null;
};

/**
 * True when the scroll position no longer matches what the controller
 * wrote: a native scroller is moving the element between our frames. Our
 * own writes only diverge by browser rounding, well under the threshold.
 */
export const hasNativeScrollTakenOver = (
  gesture: GestureState,
  el: HTMLElement,
): boolean => {
  const verticalDrift = Math.abs(el.scrollTop - gesture.expectedScrollTop);
  const horizontalDrift = Math.abs(el.scrollLeft - gesture.expectedScrollLeft);
  return verticalDrift > NATIVE_SCROLL_DRIFT_PX || horizontalDrift > NATIVE_SCROLL_DRIFT_PX;
};

/**
 * Engage the gesture once the finger leaves the tap slop, remembering the
 * slop offset so content starts moving from the engagement point rather
 * than jumping by the slop distance. Returns false while the touch is
 * still a potential tap and content must stay visually still.
 */
export const engageGesture = (
  gesture: GestureState,
  logicalDx: number,
  logicalDy: number,
): boolean => {
  if (gesture.engaged) return true;
  if (Math.abs(logicalDx) <= TAP_SLOP_PX && Math.abs(logicalDy) <= TAP_SLOP_PX) {
    return false;
  }
  gesture.engaged = true;
  gesture.slopOffsetX = logicalDx;
  gesture.slopOffsetY = logicalDy;
  return true;
};

/** DOM scroll target for the finger's logical displacement, clamped to bounds. */
export const computeDragTarget = (
  gesture: GestureState,
  el: HTMLElement,
  scrollRatio: number,
  logicalDx: number,
  logicalDy: number,
): DragTarget => ({
  top: clamp(
    gesture.baseScrollTop + (logicalDy - gesture.slopOffsetY) * scrollRatio,
    0,
    el.scrollHeight - el.clientHeight,
  ),
  left: clamp(
    gesture.baseScrollLeft + (logicalDx - gesture.slopOffsetX),
    0,
    el.scrollWidth - el.clientWidth,
  ),
});
