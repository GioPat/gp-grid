// Small helpers shared by the touch-scroll controller and its collaborators.

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Cancel a pending animation frame, tolerating environments without rAF.
 * Returns null so callers can write `this.frame = cancelFrame(this.frame)`.
 */
export const cancelFrame = (frame: number | null): null => {
  if (frame !== null) {
    globalThis.cancelAnimationFrame?.(frame);
  }
  return null;
};

let reducedMotionQuery: MediaQueryList | null | undefined;

/** Live `prefers-reduced-motion: reduce`; false where `matchMedia` is missing (SSR, tests). */
export const prefersReducedMotion = (): boolean => {
  reducedMotionQuery ??= globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  return reducedMotionQuery?.matches === true;
};
