// packages/core/src/scroll-virtualization-manager.ts

// =============================================================================
// Constants
// =============================================================================

// Maximum safe scroll height across browsers (conservative value)
// Chrome/Edge: ~33.5M, Firefox: ~17.9M, Safari: ~33.5M
// We use 10M to be safe and leave room for other content
const MAX_SCROLL_HEIGHT = 10_000_000;

// =============================================================================
// Types
// =============================================================================

export interface ScrollVirtualizationManagerOptions {
  getRowHeight: () => number;
  getHeaderHeight: () => number;
  getTotalRows: () => number;
  getScrollTop: () => number;
  getViewportHeight: () => number;
}

// =============================================================================
// ScrollVirtualizationManager
// =============================================================================

export class ScrollVirtualizationManager {
  // State
  private naturalContentHeight: number = 0;
  private virtualContentHeight: number = 0;
  private scrollRatio: number = 1;

  // Dependencies
  private readonly options: ScrollVirtualizationManagerOptions;

  constructor(options: ScrollVirtualizationManagerOptions) {
    this.options = options;
  }

  // ===========================================================================
  // Content Size Calculation
  // ===========================================================================

  /**
   * Update scroll virtualization state based on current row count.
   * Should be called whenever totalRows changes.
   */
  updateContentSize(): { naturalHeight: number; virtualHeight: number; scrollRatio: number } {
    const totalRows = this.options.getTotalRows();
    const rowHeight = this.options.getRowHeight();
    const headerHeight = this.options.getHeaderHeight();
    const viewportHeight = this.options.getViewportHeight();

    const naturalRowHeight = totalRows * rowHeight;
    this.naturalContentHeight = naturalRowHeight + headerHeight;

    if (this.naturalContentHeight > MAX_SCROLL_HEIGHT) {
      this.virtualContentHeight = MAX_SCROLL_HEIGHT;

      // The body sizer is (virtualContentHeight - headerHeight).
      // The actual scrollable range in the DOM is (sizer - viewportHeight).
      // We want that range to map exactly to the natural row scroll range
      // (naturalRowHeight - viewportHeight), so the user can always drag
      // the scrollbar to reach the last row.
      const virtualScrollRange = this.virtualContentHeight - headerHeight - viewportHeight;
      // Round up to the nearest row boundary so that at max scrollTop the last row
      // is always fully visible (not partially clipped by a fractional viewport height).
      const naturalScrollRange = Math.ceil((naturalRowHeight - viewportHeight) / rowHeight) * rowHeight;

      this.scrollRatio = naturalScrollRange > 0
        ? virtualScrollRange / naturalScrollRange
        : 1;
    } else {
      this.virtualContentHeight = this.naturalContentHeight;
      this.scrollRatio = 1;
    }

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
    return this.scrollRatio < 1;
  }

  /**
   * Get the natural (uncapped) content height.
   * Useful for debugging or displaying actual content size.
   */
  getNaturalHeight(): number {
    const totalRows = this.options.getTotalRows();
    const rowHeight = this.options.getRowHeight();
    const headerHeight = this.options.getHeaderHeight();
    return this.naturalContentHeight || (totalRows * rowHeight + headerHeight);
  }

  /**
   * Get the virtual (capped) content height for DOM use.
   */
  getVirtualHeight(): number {
    const totalRows = this.options.getTotalRows();
    const rowHeight = this.options.getRowHeight();
    const headerHeight = this.options.getHeaderHeight();
    return this.virtualContentHeight || (totalRows * rowHeight + headerHeight);
  }

  /**
   * Get the scroll ratio used for scroll virtualization.
   * Returns 1 when no virtualization is needed, < 1 when content exceeds browser limits.
   */
  getScrollRatio(): number {
    return this.scrollRatio;
  }

  /**
   * Get the visible row range (excluding overscan).
   * Returns the first and last row indices that are actually visible in the viewport.
   * Includes partially visible rows to avoid false positives when clicking on edge rows.
   */
  getVisibleRowRange(): { start: number; end: number } {
    const viewportHeight = this.options.getViewportHeight();
    const scrollTop = this.options.getScrollTop();
    const rowHeight = this.options.getRowHeight();
    const totalRows = this.options.getTotalRows();

    // The header is rendered outside the scroll container, so viewportHeight
    // already represents only the body content area
    const contentHeight = viewportHeight;
    const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowHeight));
    // Use ceil and subtract 1 to include any partially visible row at the bottom
    const lastVisibleRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + contentHeight) / rowHeight) - 1
    );
    return { start: firstVisibleRow, end: Math.max(firstVisibleRow, lastVisibleRow) };
  }

  /**
   * Get the scroll position needed to bring a row into view.
   * Accounts for scroll scaling when active.
   */
  getScrollTopForRow(rowIndex: number): number {
    const rowHeight = this.options.getRowHeight();
    const naturalScrollTop = rowIndex * rowHeight;
    // Apply scroll ratio to convert natural position to virtual scroll position
    return naturalScrollTop * this.scrollRatio;
  }

  /**
   * Get the row index at a given viewport Y position.
   * Accounts for scroll scaling when active.
   * @param viewportY Y position in viewport (physical pixels below header, NOT including scroll)
   * @param virtualScrollTop Current scroll position from container.scrollTop (virtual/scaled)
   */
  getRowIndexAtDisplayY(viewportY: number, virtualScrollTop: number): number {
    const rowHeight = this.options.getRowHeight();

    // Convert virtual scroll position to natural position
    const naturalScrollTop = this.scrollRatio < 1
      ? virtualScrollTop / this.scrollRatio
      : virtualScrollTop;

    // Natural Y = viewport offset + natural scroll position
    const naturalY = viewportY + naturalScrollTop;
    return Math.floor(naturalY / rowHeight);
  }

  // ===========================================================================
  // Internal Access (for GridCore)
  // ===========================================================================

  /**
   * Get the virtual content height for external use
   * @internal
   */
  getVirtualContentHeight(): number {
    return this.virtualContentHeight;
  }
}
