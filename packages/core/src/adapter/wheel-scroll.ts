import type { GridCore } from "../grid-core";
import type { SyntheticScroll } from "./synthetic-scroll";
import { cancelFrame, clamp, prefersReducedMotion } from "./touch-scroll-helpers";

/** Idle time after the last wheel event before native scroll owns the top again. */
export const WHEEL_RELEASE_MS = 150;
/** Remaining DOM px applied in one frame; a larger remainder glides over a few frames. */
export const WHEEL_SPREAD_MIN_STEP_PX = 4;
/** Share of the remaining glide each frame applies. */
export const WHEEL_SPREAD_FRACTION = 0.35;

interface WheelTarget<TData> {
  core: GridCore<TData>;
  el: HTMLElement;
  top: number;
}

/**
 * Dampened wheel scrolling on a scaled grid. A trackpad's dampened deltas are
 * mostly below one DOM pixel and the DOM rounds every `scrollTop` write, so
 * writing them directly drops the small ones and rounds the rest. They are
 * accumulated here as a fractional DOM top and carried to the core through the
 * synthetic scroll override, one pipeline run per animation frame. A large
 * delta (a mouse notch) glides there over a few frames instead of jumping.
 */
export class WheelScroll<TData = unknown> {
  private readonly scroll: SyntheticScroll<TData>;
  private target: WheelTarget<TData> | null = null;
  private current = 0;
  private frame: number | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by an interrupt: the rest of that wheel sequence (trackpad momentum) is dropped. */
  private dropping = false;

  constructor(scroll: SyntheticScroll<TData>) {
    this.scroll = scroll;
  }

  /** A wheel sequence owns the top and has not been released yet. */
  get pending(): boolean {
    return this.target !== null;
  }

  scrollBy(core: GridCore<TData>, el: HTMLElement, domDy: number): void {
    this.noteWheel();
    if (this.dropping) return;
    if (this.target === null) this.current = startTop(core, el);
    const base = this.target?.top ?? this.current;
    const top = clamp(base + domDy, 0, el.scrollHeight - el.clientHeight);
    this.target = { core, el, top };
    this.scheduleFrame();
  }

  /** Every wheel event restarts the idle timer that releases the top (or ends a drop). */
  noteWheel(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(this.onIdle, WHEEL_RELEASE_MS);
  }

  /** Stop where the content is and drop wheel input until the wheel rests. */
  interrupt(): void {
    const wasPending = this.pending;
    this.stop();
    if (wasPending === false) return;
    this.dropping = true;
    this.noteWheel();
  }

  /** Drop the wheel state; the caller owns releasing the override. */
  stop(): void {
    this.frame = cancelFrame(this.frame);
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.target = null;
    this.dropping = false;
  }

  private readonly onIdle = (): void => {
    this.idleTimer = null;
    if (this.frame !== null) {
      this.noteWheel();
      return;
    }
    this.dropping = false;
    this.target = null;
    this.scroll.release();
  };

  private scheduleFrame(): void {
    if (this.frame !== null) return;
    const raf = globalThis.requestAnimationFrame;
    if (raf === undefined) {
      this.step(null, true);
      return;
    }
    this.frame = raf((now) => {
      this.frame = null;
      this.step(now, prefersReducedMotion());
    });
  }

  private step(nowMs: number | null, whole: boolean): void {
    const target = this.target;
    if (target === null) return;
    this.current = whole ? target.top : glideTowards(this.current, target.top);
    this.scroll.apply(target.core, target.el, this.current, nowMs);
    if (this.current !== target.top) this.scheduleFrame();
  }
}

const glideTowards = (current: number, top: number): number => {
  const remaining = top - current;
  const size = Math.abs(remaining);
  if (size <= WHEEL_SPREAD_MIN_STEP_PX) return top;
  return current + Math.sign(remaining) * Math.max(WHEEL_SPREAD_MIN_STEP_PX, size * WHEEL_SPREAD_FRACTION);
};

/** Continue from an override (a stopped fling or earlier wheel) the DOM still agrees with. */
const startTop = <TData>(core: GridCore<TData>, el: HTMLElement): number => {
  const override = core.viewport.getTopOverride();
  if (override !== null && Math.abs(override - el.scrollTop) <= 1) return override;
  return el.scrollTop;
};
