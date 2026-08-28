import type { GridCore } from "../grid-core";
import {
  computeAdaptiveVelocityCap,
  isFlingDone,
  renderThrottleThreshold,
  stepFling,
  updateRenderIntervalEma,
  FAST_FLING_RENDER_INTERVAL_MS,
  HEAVY_FRAME_BUDGET_MS,
  type FlingState,
} from "../utils/touch-scroll-physics";
import type { SyntheticScroll } from "./synthetic-scroll";
import { cancelFrame, clamp } from "./touch-scroll-helpers";

/**
 * Momentum animation after a touch release. Integrates the fling physics
 * one rAF at a time, governs the velocity to what the device proves it can
 * render, and decides per frame whether the full pipeline runs or only the
 * scrollbar moves.
 */
export class FlingAnimator<TData = unknown> {
  private frame: number | null = null;
  private velocity = 0;
  /** Latched when measured frames prove per-frame rendering unsustainable */
  private throttled = false;
  /** Smoothed rAF frame interval measured while a fling ticks */
  private frameIntervalEmaMs: number | null = null;
  private readonly scroll: SyntheticScroll<TData>;

  constructor(scroll: SyntheticScroll<TData>) {
    this.scroll = scroll;
  }

  /** Velocity of the fling in flight (logical px/ms); 0 when none runs. */
  get currentVelocity(): number {
    return this.frame === null ? 0 : this.velocity;
  }

  /** Cancel the in-flight fling; the caller decides about the override. */
  stop(): void {
    this.frame = cancelFrame(this.frame);
  }

  start(core: GridCore<TData>, el: HTMLElement, velocity: number): void {
    const raf = globalThis.requestAnimationFrame;
    if (raf === undefined) return;

    const maxFlingVelocity = core.getMaxFlingVelocity();
    const throttleThreshold = renderThrottleThreshold(core.getRowHeight());
    const ratio = core.getScrollRatio();
    const governedCap = (): number =>
      computeAdaptiveVelocityCap(this.scroll.pipelineIntervalMs, maxFlingVelocity);
    const startCap = governedCap();
    let state: FlingState = {
      position: el.scrollTop / ratio,
      velocity: clamp(velocity, -startCap, startCap),
    };
    let lastTime: number | null = null;
    this.velocity = state.velocity;
    this.throttled = false;

    const tick = (now: number): void => {
      this.frame = null;
      const dt = this.measureFrame(now, lastTime);
      lastTime = now;
      state = stepFling(state, dt);
      // Speed governor: if the measured render pace worsened mid-fling,
      // pull the velocity down to what the device can keep rendered.
      const cap = governedCap();
      state = { ...state, velocity: clamp(state.velocity, -cap, cap) };
      this.velocity = state.velocity;
      this.updateThrottle(state.velocity, throttleThreshold);

      const target = state.position * ratio;
      const clamped = clamp(target, 0, el.scrollHeight - el.clientHeight);
      const hitBound = clamped !== target;
      const done = isFlingDone(state.velocity) || hitBound;

      // While render-throttled, only the scrollbar moves between pipeline
      // runs; the stale override keeps the native scroll events cheap.
      if (done || this.isPipelineDue(now)) {
        this.scroll.apply(core, el, clamped, now);
      } else {
        el.scrollTop = clamped;
      }

      if (done) {
        this.scroll.release();
        return;
      }
      this.frame = raf(tick);
    };
    this.frame = raf(tick);
  }

  /** Frame delta for this tick, feeding the frame-pace EMA once timed. */
  private measureFrame(now: number, lastTime: number | null): number {
    if (lastTime === null) return 16;
    const dt = now - lastTime;
    this.frameIntervalEmaMs = updateRenderIntervalEma(this.frameIntervalEmaMs, dt);
    return dt;
  }

  /**
   * Decide whether a fast fling must fall back to throttled rendering.
   * The default is a full pipeline run every frame — a reduced cadence at
   * low speed reads as rows locking and snapping. Only when the measured
   * frame pace shows the device cannot sustain per-frame renders does the
   * fling latch onto the throttled cadence, and it stays latched until the
   * fling slows below the row-flux threshold so the cadence never
   * oscillates.
   */
  private updateThrottle(velocity: number, throttleThreshold: number): void {
    if (Math.abs(velocity) <= throttleThreshold) {
      this.throttled = false;
      return;
    }
    const frameEma = this.frameIntervalEmaMs;
    if (frameEma !== null && frameEma > HEAVY_FRAME_BUDGET_MS) {
      this.throttled = true;
    }
  }

  private isPipelineDue(nowMs: number): boolean {
    if (this.throttled === false) return true;
    const lastRun = this.scroll.lastRunMs;
    return lastRun === null || nowMs - lastRun >= FAST_FLING_RENDER_INTERVAL_MS;
  }
}
