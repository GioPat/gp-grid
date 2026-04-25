// packages/core/src/managers/viewport-state.ts
// Owns the grid's viewport measurements and the scroll-ratio mapping
// between visual (DOM) scrollTop and logical (content) scrollTop.

export interface ViewportUpdateResult {
  changed: boolean;
  verticalChanged: boolean;
  viewportSizeChanged: boolean;
}

export class ViewportState {
  private scrollTop = 0;
  private scrollLeft = 0;
  private viewportWidth = 800;
  private viewportHeight = 600;
  private readonly getScrollRatio: () => number;

  constructor(getScrollRatio: () => number) {
    this.getScrollRatio = getScrollRatio;
  }

  getScrollTop(): number {
    return this.scrollTop;
  }

  getScrollLeft(): number {
    return this.scrollLeft;
  }

  getViewportWidth(): number {
    return this.viewportWidth;
  }

  getViewportHeight(): number {
    return this.viewportHeight;
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
   *
   * When `scrollRatio < 1` (virtual-scroll active), the DOM-reported
   * scrollTop is mapped to a logical scrollTop in content coordinates.
   */
  update(
    scrollTop: number,
    scrollLeft: number,
    width: number,
    height: number,
  ): ViewportUpdateResult {
    const scrollRatio = this.getScrollRatio();
    const effectiveScrollTop = scrollRatio < 1 ? scrollTop / scrollRatio : scrollTop;

    const viewportSizeChanged =
      this.viewportWidth !== width || this.viewportHeight !== height;
    const verticalChanged = this.scrollTop !== effectiveScrollTop;
    const changed =
      verticalChanged ||
      this.scrollLeft !== scrollLeft ||
      viewportSizeChanged;

    if (changed) {
      this.scrollTop = effectiveScrollTop;
      this.scrollLeft = scrollLeft;
      this.viewportWidth = width;
      this.viewportHeight = height;
    }
    return { changed, verticalChanged, viewportSizeChanged };
  }
}
