// packages/core/src/scroll-virtualization-manager.ts

// =============================================================================
// Constants
// =============================================================================

// Maximum safe scroll height across browsers (conservative value)
// Chrome/Edge: ~33.5M, Firefox: ~17.9M, Safari: ~33.5M
// We use 10M to be safe and leave room for other content
const MAX_SCROLL_HEIGHT = 10_000_000;

import type { VirtualAxis } from "../geometry/virtual-axis";

// =============================================================================
// Types
// =============================================================================

export interface ScrollVirtualizationManagerOptions {
  getHeaderHeight: () => number;
  getViewportHeight: () => number;
  /** Row axis: the only source of the row extent and row boundaries. */
  getAxis: () => VirtualAxis;
}

// =============================================================================
// ScrollVirtualizationManager
// =============================================================================

export class ScrollVirtualizationManager {
  // State
  private naturalContentHeight: number = 0;
  private virtualContentHeight: number = 0;
  private scrollRatio: number = 1;
  private syncedAxis: VirtualAxis | null = null;
  private syncedHeaderHeight = -1;
  private syncedViewportHeight = -1;

  // Dependencies
  private readonly options: ScrollVirtualizationManagerOptions;

  constructor(options: ScrollVirtualizationManagerOptions) {
    this.options = options;
  }

  // ===========================================================================
  // Content Size Calculation
  // ===========================================================================

  /**
   * Recompute only when the axis or a dimension changed. Every reader goes
   * through here, so a resize or row-count change never maps with a stale ratio.
   */
  private sync(): void {
    const axis = this.options.getAxis();
    const headerHeight = this.options.getHeaderHeight();
    const viewportHeight = this.options.getViewportHeight();
    const isCurrent =
      axis === this.syncedAxis &&
      headerHeight === this.syncedHeaderHeight &&
      viewportHeight === this.syncedViewportHeight;
    if (isCurrent) return;
    this.syncedAxis = axis;
    this.syncedHeaderHeight = headerHeight;
    this.syncedViewportHeight = viewportHeight;

    const rowExtent = axis.extent;
    this.naturalContentHeight = rowExtent + headerHeight;
    if (this.naturalContentHeight <= MAX_SCROLL_HEIGHT) {
      this.virtualContentHeight = this.naturalContentHeight;
      this.scrollRatio = 1;
      return;
    }
    this.virtualContentHeight = MAX_SCROLL_HEIGHT;

    // The body sizer is (virtualContentHeight - headerHeight).
    // The actual scrollable range in the DOM is (sizer - viewportHeight).
    // We want that range to map exactly to the natural row scroll range
    // (rowExtent - viewportHeight), so the user can always drag the
    // scrollbar to reach the last row.
    const virtualScrollRange = this.virtualContentHeight - headerHeight - viewportHeight;
    // Round up to the nearest row boundary so that at max scrollTop the last row
    // is always fully visible (not partially clipped by a fractional viewport height).
    const naturalScrollRange = this.roundUpToRowBoundary(rowExtent - viewportHeight);
    this.scrollRatio = naturalScrollRange > 0 ? virtualScrollRange / naturalScrollRange : 1;
  }

  /** Current sizes and ratio for the row axis and viewport. */
  updateContentSize(): { naturalHeight: number; virtualHeight: number; scrollRatio: number } {
    this.sync();
    return {
      naturalHeight: this.naturalContentHeight,
      virtualHeight: this.virtualContentHeight,
      scrollRatio: this.scrollRatio,
    };
  }

  // ===========================================================================
  // Public Accessors
  // ===========================================================================

  /**
   * Check if scroll scaling is active (large datasets exceeding browser scroll limits).
   * When scaling is active, scrollRatio < 1 and scroll positions are compressed.
   */
  isScalingActive(): boolean {
    this.sync();
    return this.scrollRatio < 1;
  }

  /**
   * Get the virtual (capped) content height for DOM use.
   */
  getVirtualHeight(): number {
    this.sync();
    return this.virtualContentHeight;
  }

  /**
   * Get the scroll ratio used for scroll virtualization.
   * Returns 1 when no virtualization is needed, < 1 when content exceeds browser limits.
   */
  getScrollRatio(): number {
    this.sync();
    return this.scrollRatio;
  }

  private rowExtent(): number {
    return this.options.getAxis().extent;
  }

  /**
   * First row boundary at or after `logicalOffset`. This replaces the old
   * `ceil(range / rowHeight) * rowHeight`; the axis owns the arithmetic.
   */
  private roundUpToRowBoundary(logicalOffset: number): number {
    const axis = this.options.getAxis();
    const index = axis.indexAt(logicalOffset);
    if (index >= axis.count) return axis.extent;
    const boundary = axis.getOffset(index);
    return boundary < logicalOffset ? axis.getOffset(index + 1) : boundary;
  }

  /**
   * Maximum logical (content) scroll top reachable through the DOM scroller.
   * Compressed scrolling maps the DOM range onto the row-rounded natural
   * range, so its end is that same row boundary.
   */
  getMaxLogicalScrollTop(): number {
    const natural = Math.max(0, this.rowExtent() - this.options.getViewportHeight());
    return this.isScalingActive() ? this.roundUpToRowBoundary(natural) : natural;
  }

  /**
   * Convert a DOM scroll sample to a logical (content) scroll top.
   */
  toLogicalScrollTop(domScrollTop: number): number {
    return this.isScalingActive() ? domScrollTop / this.scrollRatio : domScrollTop;
  }

  /**
   * Convert a logical (content) scroll top to a DOM scroll sample.
   */
  toDomScrollTop(logicalScrollTop: number): number {
    return this.isScalingActive() ? logicalScrollTop * this.scrollRatio : logicalScrollTop;
  }

}
