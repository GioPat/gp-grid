// packages/core/src/grid-core-viewport.ts
// Viewport sampling for GridCore: the scroll sample, geometry commits with
// their scroll correction, and the touch-scroller hooks.

import type { GridGeometryService } from "./geometry";
import type { InstructionBatcher, ScrollVirtualizationManager, ViewportState } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import type { ViewSync } from "./grid-core-view-sync";

/** Scroll hooks for adapters that drive a synthetic touch scroller. */
export interface GridViewportApi {
  /**
   * Override the DOM scrollTop that `setViewport` uses, at sub-pixel
   * resolution: under compressed scroll one DOM pixel can span a whole row,
   * so the touch scroller's fractional position must win over native scroll
   * events. `null` returns to native positions.
   */
  setTopOverride(domScrollTop: number | null): void;
  isScaling(): boolean;
  /** DOM px per logical px while scaling. */
  getScrollRatio(): number;
  /** Maximum accumulated touch-fling velocity, logical px/ms. */
  getMaxFlingVelocity(): number;
  getRowHeight(): number;
}

export interface ViewportControllerDeps<TData> {
  batcher: InstructionBatcher;
  state: ViewportState;
  scrollVirtualization: ScrollVirtualizationManager;
  maxFlingVelocity: number;
  rowHeight: number;
  getGeometry: () => GridGeometryService;
  getRowData: () => RowDataManager<TData>;
  getView: () => ViewSync<TData>;
}

export class ViewportController<TData> implements GridViewportApi {
  private readonly deps: ViewportControllerDeps<TData>;
  private topOverride: number | null = null;

  constructor(deps: ViewportControllerDeps<TData>) {
    this.deps = deps;
  }

  setTopOverride(domScrollTop: number | null): void {
    this.topOverride = domScrollTop;
  }

  isScaling(): boolean {
    return this.deps.scrollVirtualization.isScalingActive();
  }

  getScrollRatio(): number {
    return this.deps.scrollVirtualization.getScrollRatio();
  }

  getMaxFlingVelocity(): number {
    return this.deps.maxFlingVelocity;
  }

  getRowHeight(): number {
    return this.deps.rowHeight;
  }

  /** Effective DOM scroll sample: the touch override when one is active. */
  getDomScrollTop(): number {
    return this.topOverride ?? this.deps.state.getScrollTop();
  }

  update(scrollTop: number, scrollLeft: number, width: number, height: number): void {
    const { state, batcher } = this.deps;
    const previousTop = state.getScrollTop();
    const previousHeight = state.getViewportHeight();
    const { changed, viewportSizeChanged } = state.update(
      this.topOverride ?? scrollTop,
      scrollLeft,
      width,
      height,
    );
    if (changed === false) return;

    // A raw horizontal scroll cannot change which rows are visible: it only
    // moves the mounted center window. A vertical move still has to publish
    // the column window when both axes moved in one sample.
    const verticalWork =
      viewportSizeChanged || previousHeight !== height || previousTop !== state.getScrollTop();
    if (verticalWork === false) {
      this.deps.getView().syncColumnWindowOnly(
        () => this.emitScrollCorrection(),
        () => this.hasScrollCorrection(),
      );
      return;
    }

    // One batch: adapters reset the pending scroll per batch, so a correction
    // delivered ahead of the row sync would be dropped before it is applied.
    batcher.start();
    try {
      this.refreshGeometry();
      this.deps.getRowData().requestVisibleRows();
      this.deps.getView().syncVisibleRows(viewportSizeChanged);
      this.deps.getView().publishColumnWindow();
    } finally {
      batcher.flush();
    }
  }

  /**
   * Commit geometry before a batch captures its revision, so one change
   * publishes one revision; also corrects native scroll that a data or layout
   * change left outside the reachable range.
   */
  refreshGeometry(): void {
    const geometry = this.deps.getGeometry();
    geometry.refresh();
    geometry.syncColumnWindow();
    this.emitScrollCorrection();
  }

  /** Writes a corrected DOM scroll top to whichever sample is in charge. */
  writeScrollTop(domScrollTop: number): void {
    if (this.topOverride === null) {
      this.deps.state.setScrollTop(domScrollTop);
    } else {
      this.topOverride = domScrollTop;
    }
  }

  /** Geometry already answers from the clamped sample; this moves the DOM to it. */
  private emitScrollCorrection(): void {
    if (this.hasScrollCorrection() === false) return;
    const { scrollTop, scrollLeft } = this.deps.getGeometry().getEffectiveScroll();
    this.deps.batcher.emit({
      type: "SCROLL_TO",
      scrollTop: scrollTop === this.getDomScrollTop() ? undefined : scrollTop,
      scrollLeft: scrollLeft === this.deps.state.getScrollLeft() ? undefined : scrollLeft,
    });
  }

  private hasScrollCorrection(): boolean {
    const { scrollTop, scrollLeft } = this.deps.getGeometry().getEffectiveScroll();
    return scrollTop !== this.getDomScrollTop() || scrollLeft !== this.deps.state.getScrollLeft();
  }
}
