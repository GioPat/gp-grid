import type { GridCore } from "../grid-core";
import { TAP_SLOP_PX } from "../input/interaction-constants";
import {
  combineFlingVelocities,
  computeAdaptiveVelocityCap,
  computeReleaseVelocity,
  isFlingDone,
  pruneSamples,
  stepFling,
  updateRenderIntervalEma,
  FAST_FLING_RENDER_INTERVAL_MS,
  HEAVY_FRAME_BUDGET_MS,
  MIN_FLING_VELOCITY,
  RENDER_VELOCITY_THRESHOLD,
  type FlingState,
  type VelocitySample,
} from "../utils/touch-scroll-physics";

export interface TouchScrollDeps<TData = unknown> {
  getCore: () => GridCore<TData> | null;
  /** The overflow:auto body element that owns the grid scrollbars. */
  getScrollEl: () => HTMLElement | null;
  isBrowser: boolean;
}

/** Structural touch shapes so tests can dispatch plain Events. */
interface TouchPointLike {
  identifier: number;
  clientX: number;
  clientY: number;
}

interface TouchEventLike extends Event {
  touches: ArrayLike<TouchPointLike | undefined>;
  changedTouches: ArrayLike<TouchPointLike | undefined>;
}

interface GestureState {
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
}

/** Elements with their own touch capture that synthetic scrolling must skip. */
const OWN_GESTURE_SELECTOR =
  ".gp-grid-fill-handle, .gp-grid-cell--row-drag-handle";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Synthetic touch scrolling for scaled grids. When scroll virtualization
 * compresses the DOM scroll space (scrollRatio < 1), native touch scrolling
 * gets amplified through the ratio and the fling momentum no longer matches
 * the finger. This controller takes over touch gestures in that regime:
 * content tracks the finger 1:1 in logical space and release flings decay
 * with a consistent, platform-independent curve.
 *
 * Performance contract: only a passive touchstart (plus a passive wheel
 * listener that cancels flings) is attached permanently. The non-passive
 * touchmove and the end listeners are attached per-gesture, and only when
 * scaling is active — small grids keep fully native, compositor-driven
 * scrolling with zero added cost.
 */
export class TouchScrollController<TData = unknown> {
  private readonly deps: TouchScrollDeps<TData>;
  private attachedEl: HTMLElement | null = null;
  private gesture: GestureState | null = null;
  private gestureCleanup: (() => void) | null = null;
  private flingFrame: number | null = null;
  private flingVelocity = 0;
  private dragFrame: number | null = null;
  private pendingDragTarget: { top: number; left: number } | null = null;
  private savedOverscrollBehavior: string | null = null;
  private savedTouchAction: string | null = null;
  private overrideActive = false;
  /** Timestamp of the last slot/render pipeline run (drag or fling) */
  private lastPipelineRunMs: number | null = null;
  /** Smoothed interval between pipeline runs — the device's render pace */
  private pipelineIntervalEmaMs: number | null = null;
  /** Smoothed rAF frame interval measured while a fling ticks */
  private frameIntervalEmaMs: number | null = null;
  /** Latched when measured frames prove per-frame rendering unsustainable */
  private flingThrottled = false;

  constructor(deps: TouchScrollDeps<TData>) {
    this.deps = deps;
  }

  attach(): void {
    if (!this.deps.isBrowser || this.attachedEl !== null) return;
    const el = this.deps.getScrollEl();
    if (el === null) return;
    this.attachedEl = el;
    this.savedOverscrollBehavior = el.style.overscrollBehavior;
    this.savedTouchAction = el.style.touchAction;
    this.syncTouchPolicy();
    el.addEventListener("touchstart", this.onTouchStart, { passive: true });
    el.addEventListener("wheel", this.onWheel, { passive: true });
  }

  detach(): void {
    this.stop();
    this.clearGesture();
    const el = this.attachedEl;
    if (el === null) return;
    this.attachedEl = null;
    el.removeEventListener("touchstart", this.onTouchStart);
    el.removeEventListener("wheel", this.onWheel);
    if (this.savedOverscrollBehavior !== null) {
      el.style.overscrollBehavior = this.savedOverscrollBehavior;
      this.savedOverscrollBehavior = null;
    }
    if (this.savedTouchAction !== null) {
      el.style.touchAction = this.savedTouchAction;
      this.savedTouchAction = null;
    }
  }

  /**
   * While scroll scaling is active, panning must never be native: declare
   * `touch-action: none` so the browser cannot start a (ratio-amplified)
   * native scroll at all, and contain overscroll so synthetic flings do not
   * chain to the page. Non-scaled grids keep their original native policy.
   */
  private syncTouchPolicy(): void {
    const el = this.attachedEl;
    if (el === null) return;
    const scaling = this.deps.getCore()?.isScalingActive() === true;
    const desiredTouchAction = scaling ? "none" : (this.savedTouchAction ?? "");
    const desiredOverscroll = scaling ? "contain" : (this.savedOverscrollBehavior ?? "");
    if (el.style.touchAction !== desiredTouchAction) {
      el.style.touchAction = desiredTouchAction;
    }
    if (el.style.overscrollBehavior !== desiredOverscroll) {
      el.style.overscrollBehavior = desiredOverscroll;
    }
  }

  /** Cancel an in-flight fling (call before programmatic scrollTop writes). */
  stop(): void {
    if (this.flingFrame !== null) {
      globalThis.cancelAnimationFrame?.(this.flingFrame);
      this.flingFrame = null;
    }
    this.releaseScrollOverride();
  }

  /**
   * Drive the grid from the synthetic (fractional) scroll position. The DOM
   * scrollTop write is quantized by the browser and only keeps the scrollbar
   * in sync; the override + direct setViewport carry the sub-pixel position,
   * so rows glide instead of stepping one DOM-pixel's worth of rows at a
   * time under high compression.
   */
  private applySyntheticScrollTop(
    core: GridCore<TData>,
    el: HTMLElement,
    domScrollTop: number,
    nowMs: number | null,
  ): void {
    if (nowMs !== null && this.lastPipelineRunMs !== null) {
      this.pipelineIntervalEmaMs = updateRenderIntervalEma(
        this.pipelineIntervalEmaMs,
        nowMs - this.lastPipelineRunMs,
      );
    }
    this.lastPipelineRunMs = nowMs;
    this.overrideActive = true;
    core.setScrollTopOverride(domScrollTop);
    el.scrollTop = domScrollTop;
    core.setViewport(domScrollTop, el.scrollLeft, el.clientWidth, el.clientHeight);
  }

  /**
   * Decide whether a fast fling must fall back to throttled rendering.
   * The default is a full pipeline run every frame — a reduced cadence at
   * medium speed reads as freeze-and-jump stutter. Only when the measured
   * frame pace shows the device cannot sustain per-frame renders does the
   * fling latch onto the throttled cadence, and it stays latched until the
   * fling slows below the threshold so the cadence never oscillates.
   */
  private updateFlingThrottle(velocity: number): void {
    if (Math.abs(velocity) <= RENDER_VELOCITY_THRESHOLD) {
      this.flingThrottled = false;
      return;
    }
    const frameEma = this.frameIntervalEmaMs;
    if (frameEma !== null && frameEma > HEAVY_FRAME_BUDGET_MS) {
      this.flingThrottled = true;
    }
  }

  private isFlingPipelineDue(nowMs: number): boolean {
    if (!this.flingThrottled) return true;
    return (
      this.lastPipelineRunMs === null ||
      nowMs - this.lastPipelineRunMs >= FAST_FLING_RENDER_INTERVAL_MS
    );
  }

  /** Hand scroll-position ownership back to native scroll events. */
  private releaseScrollOverride(): void {
    if (!this.overrideActive) return;
    this.overrideActive = false;
    const core = this.deps.getCore();
    if (core === null) return;
    core.setScrollTopOverride(null);
    const el = this.attachedEl;
    if (el !== null) {
      core.setViewport(el.scrollTop, el.scrollLeft, el.clientWidth, el.clientHeight);
    }
  }

  private readonly onWheel = (): void => {
    this.stop();
    this.syncTouchPolicy();
  };

  private readonly onTouchStart = (event: Event): void => {
    // Keep touch policy in sync with the scaling state. A touch-action
    // change applies from the NEXT gesture because browsers sample it at
    // gesture start.
    this.syncTouchPolicy();
    if (this.gesture === null) {
      this.startTouchGesture(event);
    }
  };

  private readonly startTouchGesture = (event: Event): void => {
    // Catching the content mid-fling carries its velocity into the next
    // flick, so repeated same-direction flicks stack speed up to the cap.
    const carriedVelocity = this.flingFrame === null ? 0 : this.flingVelocity;
    this.stop();
    const core = this.deps.getCore();
    const el = this.attachedEl;
    if (core === null || el === null) return;
    if (core.isScalingActive()) {
      const target = event.target as Element | null;
      const ownGesture = target?.closest(OWN_GESTURE_SELECTOR);
      if (ownGesture) return;

      const touch = (event as TouchEventLike).changedTouches[0];
      if (touch === undefined) return;
      this.gesture = {
        touchId: touch.identifier,
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        baseScrollTop: el.scrollTop,
        baseScrollLeft: el.scrollLeft,
        engaged: false,
        slopOffsetX: 0,
        slopOffsetY: 0,
        samples: [{ time: event.timeStamp, position: 0 }],
        carriedVelocity,
      };
      this.attachGestureListeners(el);
    }
  };

  private attachGestureListeners(el: HTMLElement): void {
    el.addEventListener("touchmove", this.onTouchMove, { passive: false });
    el.addEventListener("touchend", this.onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", this.onTouchCancel, { passive: true });
    this.gestureCleanup = (): void => {
      el.removeEventListener("touchmove", this.onTouchMove);
      el.removeEventListener("touchend", this.onTouchEnd);
      el.removeEventListener("touchcancel", this.onTouchCancel);
    };
  }

  private clearGesture(): void {
    this.gesture = null;
    this.gestureCleanup?.();
    this.gestureCleanup = null;
    if (this.dragFrame !== null) {
      globalThis.cancelAnimationFrame?.(this.dragFrame);
      this.dragFrame = null;
    }
    this.pendingDragTarget = null;
  }

  private findTrackedTouch(event: Event): TouchPointLike | null {
    const gesture = this.gesture;
    if (gesture === null) return null;
    const touches = (event as TouchEventLike).changedTouches;
    for (const touch of Array.from(touches)) {
      if (touch?.identifier === gesture.touchId) {
        return touch;
      }
    }
    return null;
  }

  private readonly onTouchMove = (event: Event): void => {
    const gesture = this.gesture;
    const touch = this.findTrackedTouch(event);
    const core = this.deps.getCore();
    const el = this.attachedEl;
    if (gesture === null || touch === null || core === null || el === null) {
      return;
    }
    if (core.input.getDragState().isDragging) {
      // A long-press row drag or fill drag confirmed mid-gesture; its own
      // controller locks the container, so abandon the scroll gesture.
      this.clearGesture();
      this.releaseScrollOverride();
      return;
    }
    if (!event.cancelable) {
      // Native scrolling already owns this gesture (its first touchmove
      // was not canceled, e.g. it began before we attached) — back off
      // instead of fighting the native scroller frame by frame.
      this.clearGesture();
      this.releaseScrollOverride();
      return;
    }
    // Cancel from the VERY FIRST move, including moves inside the tap slop.
    // Android Chrome decides scroll ownership on the first touchmove: if it
    // is not canceled, native (ratio-amplified) scrolling starts and every
    // later touchmove arrives cancelable=false, making preventDefault a
    // silent no-op for the rest of the gesture. Taps are unaffected — they
    // produce no touchmove, and click/dblclick synthesis only depends on
    // touchstart/touchend remaining uncanceled.
    event.preventDefault();

    const logicalDx = gesture.startClientX - touch.clientX;
    const logicalDy = gesture.startClientY - touch.clientY;
    gesture.samples.push({ time: event.timeStamp, position: logicalDy });
    gesture.samples = pruneSamples(gesture.samples, event.timeStamp);

    if (!gesture.engaged) {
      if (
        Math.abs(logicalDx) <= TAP_SLOP_PX &&
        Math.abs(logicalDy) <= TAP_SLOP_PX
      ) {
        return; // still a potential tap: keep content visually still
      }
      gesture.engaged = true;
      gesture.slopOffsetX = logicalDx;
      gesture.slopOffsetY = logicalDy;
    }

    const ratio = core.getScrollRatio();
    // Coalesce to one pipeline run per animation frame: touchmove can fire
    // at 120Hz on modern devices, and running slot sync + a framework
    // render per event makes rendering lag behind the finger.
    this.pendingDragTarget = {
      top: clamp(
        gesture.baseScrollTop + (logicalDy - gesture.slopOffsetY) * ratio,
        0,
        el.scrollHeight - el.clientHeight,
      ),
      left: clamp(
        gesture.baseScrollLeft + (logicalDx - gesture.slopOffsetX),
        0,
        el.scrollWidth - el.clientWidth,
      ),
    };
    this.scheduleDragApply(core, el);
  };

  private scheduleDragApply(core: GridCore<TData>, el: HTMLElement): void {
    if (this.dragFrame !== null) return;
    const raf = globalThis.requestAnimationFrame;
    if (raf === undefined) {
      this.flushPendingDrag(core, el, null);
      return;
    }
    this.dragFrame = raf((now) => {
      this.dragFrame = null;
      this.flushPendingDrag(core, el, now);
    });
  }

  private flushPendingDrag(
    core: GridCore<TData>,
    el: HTMLElement,
    nowMs: number | null,
  ): void {
    const target = this.pendingDragTarget;
    if (target === null) return;
    this.pendingDragTarget = null;
    el.scrollLeft = target.left;
    // While the finger is down the workload is self-limiting (content moves
    // at most one screen per gesture), so every coalesced frame runs the
    // full pipeline — throttling under the finger reads as jank, not speed.
    this.applySyntheticScrollTop(core, el, target.top, nowMs);
  }

  private readonly onTouchEnd = (event: Event): void => {
    const gesture = this.gesture;
    if (gesture === null || this.findTrackedTouch(event) === null) return;
    const engaged = gesture.engaged;
    const carried = gesture.carriedVelocity;
    const samples = pruneSamples(gesture.samples, event.timeStamp);
    const pendingTarget = this.pendingDragTarget;
    this.clearGesture(); // drops the pending target and its scheduled frame
    const core = this.deps.getCore();
    const el = this.attachedEl;
    if (pendingTarget !== null && core !== null && el !== null) {
      // The release position is always fully rendered, never deferred.
      el.scrollLeft = pendingTarget.left;
      this.applySyntheticScrollTop(core, el, pendingTarget.top, event.timeStamp);
    }
    if (!engaged) return;
    const release = computeReleaseVelocity(samples);
    if (Math.abs(release) < MIN_FLING_VELOCITY) {
      // The finger stopped before lifting: the content was caught, so any
      // carried velocity dies with it.
      this.releaseScrollOverride();
      return;
    }
    this.startFling(combineFlingVelocities(release, carried));
  };

  private readonly onTouchCancel = (event: Event): void => {
    if (this.findTrackedTouch(event) === null) return;
    this.clearGesture();
    this.releaseScrollOverride();
  };

  private startFling(velocity: number): void {
    const raf = globalThis.requestAnimationFrame;
    const core = this.deps.getCore();
    const el = this.attachedEl;
    if (raf === undefined || core === null || el === null) return;

    const startCap = computeAdaptiveVelocityCap(this.pipelineIntervalEmaMs);
    const ratio = core.getScrollRatio();
    let state: FlingState = {
      position: el.scrollTop / ratio,
      velocity: clamp(velocity, -startCap, startCap),
    };
    let lastTime: number | null = null;
    this.flingVelocity = state.velocity;
    this.flingThrottled = false;

    const tick = (now: number): void => {
      this.flingFrame = null;
      const dt = lastTime === null ? 16 : now - lastTime;
      if (lastTime !== null) {
        this.frameIntervalEmaMs = updateRenderIntervalEma(
          this.frameIntervalEmaMs,
          dt,
        );
      }
      lastTime = now;
      state = stepFling(state, dt);
      // Speed governor: if the measured render pace worsened mid-fling,
      // pull the velocity down to what the device can keep rendered.
      const cap = computeAdaptiveVelocityCap(this.pipelineIntervalEmaMs);
      state = { ...state, velocity: clamp(state.velocity, -cap, cap) };
      this.flingVelocity = state.velocity;
      this.updateFlingThrottle(state.velocity);
      const target = state.position * ratio;
      const max = el.scrollHeight - el.clientHeight;
      const clamped = clamp(target, 0, max);
      const hitBound = clamped !== target;
      const done = isFlingDone(state.velocity) || hitBound;

      // While render-throttled, only the scrollbar moves between pipeline
      // runs; the stale override keeps the native scroll events cheap.
      if (done || this.isFlingPipelineDue(now)) {
        this.applySyntheticScrollTop(core, el, clamped, now);
      } else {
        el.scrollTop = clamped;
      }

      if (done) {
        this.releaseScrollOverride();
        return;
      }
      this.flingFrame = raf(tick);
    };
    this.flingFrame = raf(tick);
  }
}
