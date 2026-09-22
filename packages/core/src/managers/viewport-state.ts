// packages/core/src/managers/viewport-state.ts
// Owns the grid's viewport measurements and the raw DOM scroll samples the
// core reported. Converting a sample to logical (content) coordinates is
// geometry's job now, so this class never needs the scroll ratio.

export interface ViewportUpdateResult {
  changed: boolean;
  /** Width/height differ from the previous sample. */
  viewportSizeChanged: boolean;
}

/**
 * Height estimate until the adapter reports a measurement (SSR, first paint).
 * A measured zero is a collapsed host and stays zero.
 */
const UNMEASURED_VIEWPORT_HEIGHT = 600;

export class ViewportState {
  private scrollTop = 0;
  private scrollLeft = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private isMeasured = false;

  /** Raw DOM vertical scroll sample; geometry maps it to logical space. */
  getScrollTop(): number {
    return this.scrollTop;
  }

  /** Raw DOM horizontal scroll sample. */
  getScrollLeft(): number {
    return this.scrollLeft;
  }

  getViewportWidth(): number {
    return this.viewportWidth;
  }

  getViewportHeight(): number {
    return this.isMeasured ? this.viewportHeight : UNMEASURED_VIEWPORT_HEIGHT;
  }

  /**
   * Reset the visible-scroll position to the top. Used by sort/filter
   * change to present a fresh view from row 0.
   */
  resetScrollTop(): void {
    this.scrollTop = 0;
  }

  /**
   * Apply a new viewport state. Returns what actually changed so the
   * caller can decide which side effects to run.
   */
  update(
    scrollTop: number,
    scrollLeft: number,
    width: number,
    height: number,
  ): ViewportUpdateResult {
    // The first measurement replaces the estimate even when it reads 0 × 0.
    const isFirstMeasurement = this.isMeasured === false;
    this.isMeasured = true;
    const viewportSizeChanged =
      isFirstMeasurement || this.viewportWidth !== width || this.viewportHeight !== height;
    const changed =
      this.scrollTop !== scrollTop ||
      this.scrollLeft !== scrollLeft ||
      viewportSizeChanged;

    if (changed) {
      this.scrollTop = scrollTop;
      this.scrollLeft = scrollLeft;
      this.viewportWidth = width;
      this.viewportHeight = height;
    }
    return { changed, viewportSizeChanged };
  }
}
