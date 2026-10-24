// packages/core/src/utils/yield-to-paint.ts

/** Resolves after the browser has had a chance to paint; a macrotask outside a browser. */
export const yieldToPaint = (): Promise<void> =>
  new Promise((resolve) => {
    const raf = globalThis.requestAnimationFrame;
    if (raf === undefined) {
      setTimeout(resolve, 0);
      return;
    }
    raf(() => setTimeout(resolve, 0));
  });
