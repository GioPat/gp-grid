import { readIsRtl, toPhysicalX } from "./inline-axis";

/**
 * Continuous scroll driver used while a drag (selection, fill, row-drag)
 * leaves the viewport. The caller provides the scroll element getter and
 * a tick callback that re-processes the most recent pointer event after
 * each programmatic scroll, so the visible region catches up under the
 * pointer.
 *
 * Framework-agnostic: accepts plain getter/callback functions and relies
 * only on setInterval + element.scrollTop/scrollLeft. Horizontal deltas are
 * inline-start-relative; the direction is sampled once when the loop starts.
 */
export class AutoScrollDriver {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastPointerEvent: PointerEvent | null = null;
  private rtl = false;
  private readonly getBodyEl: () => HTMLElement | null;
  private readonly onTick: (event: PointerEvent) => void;

  constructor(
    getBodyEl: () => HTMLElement | null,
    onTick: (event: PointerEvent) => void,
  ) {
    this.getBodyEl = getBodyEl;
    this.onTick = onTick;
  }

  recordPointer(event: PointerEvent): void {
    this.lastPointerEvent = event;
  }

  clearPointer(): void {
    this.lastPointerEvent = null;
  }

  start(dx: number, dy: number): void {
    this.stop();
    this.rtl = readIsRtl(this.getBodyEl());
    this.intervalId = setInterval(() => {
      const bodyEl = this.getBodyEl();
      if (!bodyEl) return;
      bodyEl.scrollTop += dy;
      bodyEl.scrollLeft += toPhysicalX(dx, this.rtl);
      const last = this.lastPointerEvent;
      if (last) this.onTick(last);
    }, 16);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
