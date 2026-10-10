// packages/core/src/input/motion-gate.ts
// A press while a fling or wheel glide moves the content only stops it; the
// click and double-click of that press, which the DOM delivers later, do nothing.

import type { GridViewportApi } from "../grid-core-viewport";

/** Longest gap between the two presses of a double-click on common platforms. */
const STOP_GUARD_MS = 500;

export class MotionGate {
  private readonly viewport: Pick<GridViewportApi, "isScrollMotionActive" | "interruptScrollMotion">;
  private stoppedAt = Number.NEGATIVE_INFINITY;

  constructor(viewport: Pick<GridViewportApi, "isScrollMotionActive" | "interruptScrollMotion">) {
    this.viewport = viewport;
  }

  /**
   * Absorbs a press that lands on moving content, stopping it. A touch press is
   * absorbed but stops nothing: touchstart carries the fling's velocity into a flick.
   */
  absorbPress(pointerType?: string): boolean {
    if (this.viewport.isScrollMotionActive() === false) return false;
    if (pointerType !== "touch") this.viewport.interruptScrollMotion();
    this.stoppedAt = Date.now();
    return true;
  }

  /** Absorbs a click or double-click during the motion or from the press that stopped it. */
  absorbClick(): boolean {
    return this.absorbPress() || Date.now() - this.stoppedAt < STOP_GUARD_MS;
  }
}
