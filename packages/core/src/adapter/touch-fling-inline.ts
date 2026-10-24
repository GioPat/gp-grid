// packages/core/src/adapter/touch-fling-inline.ts
// The inline half of a release. The inline axis is never scaled, so the fling
// integrates in DOM px and writes `scrollLeft` straight, inside the inline
// range (0..max in LTR, -max..0 in RTL); another writer moving the element
// ends it.

import { isFlingDone, MAX_FRAME_DT_MS, stepFling, type FlingState } from "../utils/touch-scroll-physics";
import { cancelFrame, clamp } from "./touch-scroll-helpers";

export class InlineFlingAnimator {
  private frame: number | null = null;
  private velocity = 0;

  get active(): boolean {
    return this.frame !== null;
  }

  /** Velocity still alive, for the flick that catches the content. */
  get currentVelocity(): number {
    return this.frame === null ? 0 : this.velocity;
  }

  stop(): void {
    this.frame = cancelFrame(this.frame);
    this.velocity = 0;
  }

  start(el: HTMLElement, velocity: number, rtl: boolean, maxVelocity: number): void {
    const raf = globalThis.requestAnimationFrame;
    if (raf === undefined) return;
    this.stop();
    let state: FlingState = { position: el.scrollLeft, velocity: clamp(velocity, -maxVelocity, maxVelocity) };
    let lastTime: number | null = null;
    let lastWritten = el.scrollLeft;
    this.velocity = state.velocity;

    const tick = (now: number): void => {
      this.frame = null;
      if (Math.abs(el.scrollLeft - lastWritten) > 1) {
        this.velocity = 0;
        return;
      }
      const dt = lastTime === null ? 16 : Math.min(now - lastTime, MAX_FRAME_DT_MS);
      lastTime = now;
      state = stepFling(state, dt);
      const max = el.scrollWidth - el.clientWidth;
      const target = rtl ? clamp(state.position, -max, 0) : clamp(state.position, 0, max);
      el.scrollLeft = target;
      lastWritten = el.scrollLeft;
      this.velocity = state.velocity;
      if (isFlingDone(state.velocity) || target !== state.position) {
        this.velocity = 0;
        return;
      }
      this.frame = raf(tick);
    };
    this.frame = raf(tick);
  }
}
