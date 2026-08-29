import type { GridCore } from "../grid-core";
import {
  combineFlingVelocities,
  computeReleaseVelocity,
  pruneSamples,
  MIN_FLING_VELOCITY,
} from "../utils/touch-scroll-physics";
import { SyntheticScroll } from "./synthetic-scroll";
import { FlingAnimator } from "./touch-fling";
import {
  computeDragTarget,
  createGestureState,
  engageGesture,
  findTrackedTouch,
  hasNativeScrollTakenOver,
  type DragTarget,
  type GestureState,
  type TouchEventLike,
} from "./touch-gesture";
import { TouchPolicy } from "./touch-policy";
import { cancelFrame } from "./touch-scroll-helpers";

export interface TouchScrollDeps<TData = unknown> {
  getCore: () => GridCore<TData> | null;
  /** The overflow:auto body element that owns the grid scrollbars. */
  getScrollEl: () => HTMLElement | null;
  isBrowser: boolean;
}

interface ScrollContext<TData> {
  core: GridCore<TData>;
  el: HTMLElement;
}

/** Elements with their own touch capture that synthetic scrolling must skip. */
const OWN_GESTURE_SELECTOR =
  ".gp-grid-fill-handle, .gp-grid-cell--row-drag-handle";

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
 *
 * Collaborators: `TouchPolicy` owns the element's touch-action policy,
 * `SyntheticScroll` bridges the fractional position to the core, and
 * `FlingAnimator` runs the release momentum.
 */
export class TouchScrollController<TData = unknown> {
  private readonly deps: TouchScrollDeps<TData>;
  private readonly scroll: SyntheticScroll<TData>;
  private readonly fling: FlingAnimator<TData>;
  private attachedEl: HTMLElement | null = null;
  private policy: TouchPolicy<TData> | null = null;
  private gesture: GestureState | null = null;
  private gestureCleanup: (() => void) | null = null;
  private dragFrame: number | null = null;
  private pendingDragTarget: DragTarget | null = null;

  constructor(deps: TouchScrollDeps<TData>) {
    this.deps = deps;
    this.scroll = new SyntheticScroll(deps.getCore, () => this.attachedEl);
    this.fling = new FlingAnimator(this.scroll);
  }

  attach(): void {
    if (this.deps.isBrowser === false || this.attachedEl !== null) return;
    const el = this.deps.getScrollEl();
    if (el === null) return;
    this.attachedEl = el;
    this.policy = new TouchPolicy(el, this.deps.getCore);
    this.policy.sync();
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
    this.policy?.dispose();
    this.policy = null;
  }

  /** Rebind policy updates after the host replaces its GridCore instance. */
  syncCore(): void {
    this.policy?.sync();
  }

  /** Cancel an in-flight fling (call before programmatic scrollTop writes). */
  stop(): void {
    this.fling.stop();
    this.scroll.release();
  }

  private resolveContext(): ScrollContext<TData> | null {
    const core = this.deps.getCore();
    const el = this.attachedEl;
    if (core === null || el === null) return null;
    return { core, el };
  }

  private readonly onWheel = (): void => {
    this.stop();
    this.syncCore();
  };

  private readonly onTouchStart = (event: Event): void => {
    // Last-resort policy sync: the content-size subscription applies the
    // policy eagerly, but the core may have appeared (or been rebuilt)
    // since attach. A touch-action change made here only applies from the
    // NEXT gesture because browsers sample it at gesture start.
    this.syncCore();
    if (this.gesture === null) {
      this.startTouchGesture(event);
    }
  };

  private startTouchGesture(event: Event): void {
    // Catching the content mid-fling carries its velocity into the next
    // flick, so repeated same-direction flicks stack speed up to the cap.
    const carriedVelocity = this.fling.currentVelocity;
    this.stop();
    const ctx = this.resolveContext();
    if (ctx === null || ctx.core.isScalingActive() === false) return;
    const target = event.target as Element | null;
    if (target?.closest(OWN_GESTURE_SELECTOR)) return;
    const touch = (event as TouchEventLike).changedTouches[0];
    if (touch === undefined) return;
    this.gesture = createGestureState(touch, ctx.el, event.timeStamp, carriedVelocity);
    this.attachGestureListeners(ctx.el);
  }

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
    this.dragFrame = cancelFrame(this.dragFrame);
    this.pendingDragTarget = null;
  }

  /** Drop the gesture and hand scrolling back to the browser. */
  private abandonGesture(): void {
    this.clearGesture();
    this.scroll.release();
  }

  private trackedTouch(event: Event): ReturnType<typeof findTrackedTouch> {
    return this.gesture === null ? null : findTrackedTouch(this.gesture, event);
  }

  private readonly onTouchMove = (event: Event): void => {
    const gesture = this.gesture;
    const touch = this.trackedTouch(event);
    const ctx = this.resolveContext();
    if (gesture === null || touch === null || ctx === null) return;
    if (ctx.core.input.getDragState().isDragging) {
      // A long-press row drag or fill drag confirmed mid-gesture; its own
      // controller locks the container, so abandon the scroll gesture.
      this.abandonGesture();
      return;
    }
    if (hasNativeScrollTakenOver(gesture, ctx.el)) {
      // The element moved between our writes, so a native scroller owns
      // this gesture (e.g. it started before the touch-action override was
      // sampled) — back off instead of fighting it frame by frame.
      // `event.cancelable` is deliberately NOT the ownership signal: iOS
      // Safari delivers non-cancelable touchmoves under `touch-action:
      // none` even though no native scroll is running, and bailing on
      // those froze the whole gesture (nothing left to scroll it).
      this.abandonGesture();
      return;
    }
    // Cancel from the VERY FIRST move, including moves inside the tap slop.
    // Android Chrome decides scroll ownership on the first touchmove: if it
    // is not canceled, native (ratio-amplified) scrolling starts and every
    // later touchmove arrives cancelable=false, making preventDefault a
    // silent no-op for the rest of the gesture. Taps are unaffected — they
    // produce no touchmove, and click/dblclick synthesis only depends on
    // touchstart/touchend remaining uncanceled.
    if (event.cancelable) {
      event.preventDefault();
    }

    const logicalDx = gesture.startClientX - touch.clientX;
    const logicalDy = gesture.startClientY - touch.clientY;
    gesture.samples.push({ time: event.timeStamp, position: logicalDy });
    gesture.samples = pruneSamples(gesture.samples, event.timeStamp);
    if (engageGesture(gesture, logicalDx, logicalDy) === false) return;

    // Coalesce to one pipeline run per animation frame: touchmove can fire
    // at 120Hz on modern devices, and running slot sync + a framework
    // render per event makes rendering lag behind the finger.
    this.pendingDragTarget = computeDragTarget(
      gesture,
      ctx.el,
      ctx.core.getScrollRatio(),
      logicalDx,
      logicalDy,
    );
    this.scheduleDragApply(ctx);
  };

  private scheduleDragApply(ctx: ScrollContext<TData>): void {
    if (this.dragFrame !== null) return;
    const raf = globalThis.requestAnimationFrame;
    if (raf === undefined) {
      this.flushPendingDrag(ctx, null);
      return;
    }
    this.dragFrame = raf((now) => {
      this.dragFrame = null;
      this.flushPendingDrag(ctx, now);
    });
  }

  private flushPendingDrag(ctx: ScrollContext<TData>, nowMs: number | null): void {
    const target = this.pendingDragTarget;
    if (target === null) return;
    this.pendingDragTarget = null;
    this.applyDragTarget(ctx, target, nowMs);
  }

  /**
   * Render a drag position. While the finger is down the workload is
   * self-limiting (content moves at most one screen per gesture), so every
   * coalesced frame runs the full pipeline — throttling under the finger
   * reads as jank, not speed.
   */
  private applyDragTarget(
    ctx: ScrollContext<TData>,
    target: DragTarget,
    nowMs: number | null,
  ): void {
    ctx.el.scrollLeft = target.left;
    if (this.gesture !== null) {
      this.gesture.expectedScrollTop = target.top;
      this.gesture.expectedScrollLeft = target.left;
    }
    this.scroll.apply(ctx.core, ctx.el, target.top, nowMs);
  }

  private readonly onTouchEnd = (event: Event): void => {
    const gesture = this.gesture;
    if (gesture === null || this.trackedTouch(event) === null) return;
    const pendingTarget = this.pendingDragTarget;
    this.clearGesture(); // drops the pending target and its scheduled frame
    const ctx = this.resolveContext();
    if (ctx === null) {
      this.scroll.release();
      return;
    }
    if (pendingTarget !== null) {
      // The release position is always fully rendered, never deferred.
      this.applyDragTarget(ctx, pendingTarget, event.timeStamp);
    }
    if (gesture.engaged === false) return;

    const maxFlingVelocity = ctx.core.getMaxFlingVelocity();
    const samples = pruneSamples(gesture.samples, event.timeStamp);
    const release = computeReleaseVelocity(samples, maxFlingVelocity);
    if (Math.abs(release) < MIN_FLING_VELOCITY) {
      // The finger stopped before lifting: the content was caught, so any
      // carried velocity dies with it.
      this.scroll.release();
      return;
    }
    const velocity = combineFlingVelocities(release, gesture.carriedVelocity, maxFlingVelocity);
    this.fling.start(ctx.core, ctx.el, velocity);
  };

  private readonly onTouchCancel = (event: Event): void => {
    if (this.trackedTouch(event) === null) return;
    this.abandonGesture();
  };
}
