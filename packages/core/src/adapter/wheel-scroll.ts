import type { GridCore } from "../grid-core";
import type { SyntheticScroll } from "./synthetic-scroll";
import { cancelFrame, clamp } from "./touch-scroll-helpers";

/** Idle time after the last wheel event before native scroll owns the top again. */
export const WHEEL_RELEASE_MS = 150;

/**
 * Dampened wheel scrolling on a scaled grid. A trackpad's dampened deltas are
 * mostly below one DOM pixel and the DOM rounds every `scrollTop` write, so
 * writing them directly drops the small ones and rounds the rest. They are
 * accumulated here as a fractional DOM top and carried to the core through the
 * synthetic scroll override, one pipeline run per animation frame.
 */
export class WheelScroll<TData = unknown> {
  private readonly scroll: SyntheticScroll<TData>;
  private target: number | null = null;
  private pending: { core: GridCore<TData>; el: HTMLElement; top: number } | null = null;
  private frame: number | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(scroll: SyntheticScroll<TData>) {
    this.scroll = scroll;
  }

  scrollBy(core: GridCore<TData>, el: HTMLElement, domDy: number): void {
    const base = this.target ?? startTop(core, el);
    this.target = clamp(base + domDy, 0, el.scrollHeight - el.clientHeight);
    this.scheduleApply(core, el, this.target);
    this.scheduleRelease();
  }

  /** Hand the top back to native scroll once the wheel has been idle. */
  scheduleRelease(): void {
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.flush();
      this.target = null;
      this.scroll.release();
    }, WHEEL_RELEASE_MS);
  }

  /** Drop the wheel state; the caller owns releasing the override. */
  stop(): void {
    this.frame = cancelFrame(this.frame);
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.target = null;
    this.pending = null;
  }

  private scheduleApply(core: GridCore<TData>, el: HTMLElement, top: number): void {
    this.pending = { core, el, top };
    if (this.frame !== null) return;
    const raf = globalThis.requestAnimationFrame;
    if (raf === undefined) {
      this.flush();
      return;
    }
    this.frame = raf((now) => {
      this.frame = null;
      this.flush(now);
    });
  }

  private flush(nowMs: number | null = null): void {
    const pending = this.pending;
    this.pending = null;
    this.frame = cancelFrame(this.frame);
    if (pending === null) return;
    this.scroll.apply(pending.core, pending.el, pending.top, nowMs);
  }
}

/** Continue from an override (a stopped fling or earlier wheel) the DOM still agrees with. */
const startTop = <TData>(core: GridCore<TData>, el: HTMLElement): number => {
  const override = core.viewport.getTopOverride();
  if (override !== null && Math.abs(override - el.scrollTop) <= 1) return override;
  return el.scrollTop;
};
