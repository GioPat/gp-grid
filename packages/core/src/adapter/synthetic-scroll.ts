import type { GridCore } from "../grid-core";
import { updateRenderIntervalEma } from "../utils/touch-scroll-physics";

/**
 * Bridge between a synthetic (fractional) scroll position and the grid.
 *
 * The DOM scrollTop write is quantized by the browser and only keeps the
 * scrollbar in sync; the core override plus a direct setViewport carry the
 * sub-pixel position, so rows glide instead of stepping one DOM-pixel's
 * worth of rows at a time under high compression. Every apply is also a
 * pipeline run, so the interval between applies measures the device's
 * render pace for the fling speed governor.
 */
export class SyntheticScroll<TData = unknown> {
  private overrideActive = false;
  /** Timestamp of the last slot/render pipeline run (drag or fling) */
  private lastPipelineRunMs: number | null = null;
  /** Smoothed interval between pipeline runs — the device's render pace */
  private pipelineIntervalEmaMs: number | null = null;
  private readonly getCore: () => GridCore<TData> | null;
  private readonly getEl: () => HTMLElement | null;

  constructor(
    getCore: () => GridCore<TData> | null,
    getEl: () => HTMLElement | null,
  ) {
    this.getCore = getCore;
    this.getEl = getEl;
  }

  /** Smoothed pipeline-run interval (ms); null until two runs were timed. */
  get pipelineIntervalMs(): number | null {
    return this.pipelineIntervalEmaMs;
  }

  /** Timestamp of the last pipeline run; null before the first timed run. */
  get lastRunMs(): number | null {
    return this.lastPipelineRunMs;
  }

  /** Drive the grid from `domScrollTop` and record the pipeline run time. */
  apply(
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

  /** Hand scroll-position ownership back to native scroll events. */
  release(): void {
    if (this.overrideActive === false) return;
    this.overrideActive = false;
    const core = this.getCore();
    if (core === null) return;
    core.setScrollTopOverride(null);
    const el = this.getEl();
    if (el !== null) {
      core.setViewport(el.scrollTop, el.scrollLeft, el.clientWidth, el.clientHeight);
    }
  }
}
