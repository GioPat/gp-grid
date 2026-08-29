// packages/core/src/grid-core-view-sync.ts
// Keeps the rendered view in step with grid state. Every path that changes
// what the wrappers should show — initial load, refresh, sort/filter, column
// changes, a paginated window arriving, viewport scroll/resize — funnels
// through one of two choreographies so ordering and batching are decided
// exactly once:
//
// - reconcile():       the dataset or the column set changed; rebuild all.
// - syncVisibleRows(): the visible window moved or grew; slot sync only.
//
// Content size is always emitted before slots are positioned: it refreshes
// the cached scroll ratio that slot translateY values are computed from.

import type { SlotPoolManager } from "./slot-pool";
import type {
  HighlightManager,
  InstructionBatcher,
  ScrollVirtualizationManager,
  SortFilterManager,
  ViewportState,
} from "./managers";
import type { ColumnDefinition } from "./types";

// With scroll virtualization active a fast fling traverses several rows per
// frame; overscan below this leaves blank rows behind the fling.
const RECOMMENDED_SCALED_OVERSCAN = 10;

export interface ViewSyncDeps<TData> {
  batcher: InstructionBatcher;
  scrollVirtualization: ScrollVirtualizationManager;
  slotPool: SlotPoolManager;
  viewport: ViewportState;
  sortFilter: SortFilterManager<TData>;
  highlight: HighlightManager<TData> | null;
  overscan: number;
  getColumns: () => ColumnDefinition[];
  getColumnPositions: () => number[];
  getTotalRows: () => number;
}

export class ViewSync<TData> {
  private readonly deps: ViewSyncDeps<TData>;
  private hasWarnedAboutScaledOverscan = false;

  constructor(deps: ViewSyncDeps<TData>) {
    this.deps = deps;
  }

  /**
   * The dataset or the column set changed: re-derive every view instruction
   * and deliver them as one batch. Each emitter is idempotent, so callers
   * never need to pick a subset.
   */
  reconcile(): void {
    const { batcher, highlight, slotPool } = this.deps;
    batcher.start();
    try {
      highlight?.clearAllCaches();
      this.emitContentSize();
      // refreshAllSlots re-reads existing slot data (row contents may have
      // changed without totalRows changing) and ends with a syncSlots().
      slotPool.refreshAllSlots();
      this.emitHeaders();
      this.emitVisibleRange();
    } finally {
      batcher.flush();
    }
  }

  /**
   * The visible window moved (scroll), the viewport was resized, or a
   * paginated row window arrived. Cheap slot sync; content size is
   * re-emitted first when the caller knows it changed.
   */
  syncVisibleRows(contentSizeChanged: boolean): void {
    const { batcher, slotPool } = this.deps;
    batcher.start();
    try {
      if (contentSizeChanged) this.emitContentSize();
      slotPool.syncSlots();
      this.emitVisibleRange();
    } finally {
      batcher.flush();
    }
  }

  /**
   * A column was resized or moved: widths, headers and the wrappers' column
   * list are stale. An "order" change also shifts cell contents between
   * columns, so every slot is re-assigned and the index-keyed highlight
   * caches are dropped; a "geometry" change only needs slot positions synced.
   */
  syncColumnLayout(change: "geometry" | "order"): void {
    const { batcher, highlight, slotPool } = this.deps;
    batcher.start();
    try {
      this.emitContentSize();
      this.emitHeaders();
      batcher.emit({ type: "COLUMNS_CHANGED", columns: [...this.deps.getColumns()] });
      if (change === "order") {
        highlight?.clearAllCaches();
        slotPool.refreshAllSlots();
      } else {
        slotPool.syncSlots();
      }
    } finally {
      batcher.flush();
    }
  }

  emitContentSize(): void {
    const { batcher, scrollVirtualization, slotPool, viewport } = this.deps;
    const width = this.deps.getColumnPositions().at(-1) ?? 0;
    scrollVirtualization.updateContentSize();
    batcher.emit({
      type: "SET_CONTENT_SIZE",
      width,
      height: scrollVirtualization.getVirtualHeight(),
      viewportWidth: viewport.getViewportWidth(),
      viewportHeight: viewport.getViewportHeight(),
      rowsWrapperOffset: slotPool.getRowsWrapperOffset(),
    });
    this.warnIfOverscanTooLowForScaling();
  }

  emitHeaders(): void {
    const { batcher, sortFilter } = this.deps;
    const sortInfoMap = sortFilter.getSortInfoMap();
    for (const [colIndex, column] of this.deps.getColumns().entries()) {
      const colId = column.colId ?? column.field;
      const sortInfo = sortInfoMap.get(colId);
      batcher.emit({
        type: "UPDATE_HEADER",
        colIndex,
        column,
        sortDirection: sortInfo?.direction,
        sortIndex: sortInfo?.index,
        hasFilter: sortFilter.hasActiveFilter(colId),
      });
    }
  }

  emitVisibleRange(): void {
    const { batcher, scrollVirtualization, slotPool } = this.deps;
    const visibleRange = scrollVirtualization.getVisibleRowRange();
    batcher.emit({
      type: "UPDATE_VISIBLE_RANGE",
      start: visibleRange.start,
      end: visibleRange.end,
      rowsWrapperOffset: slotPool.getRowsWrapperOffset(),
    });
  }

  /**
   * One-time advisory when scroll virtualization kicks in with a small
   * overscan: momentum flings move several rows per frame at that scale,
   * and a small overscan shows blank rows behind the fling.
   */
  private warnIfOverscanTooLowForScaling(): void {
    if (this.hasWarnedAboutScaledOverscan) return;
    if (this.deps.scrollVirtualization.isScalingActive() === false) return;
    this.hasWarnedAboutScaledOverscan = true;
    const { overscan } = this.deps;
    if (overscan >= RECOMMENDED_SCALED_OVERSCAN) return;
    const totalRows = this.deps.getTotalRows().toLocaleString();
    console.warn(
      `[gp-grid] Scroll virtualization is active (${totalRows} rows) ` +
      `but overscan is ${overscan}. Fast momentum scrolling can outrun rendering and show blank rows ` +
      `at this scale — set the overscan option to 10–12.`,
    );
  }
}
