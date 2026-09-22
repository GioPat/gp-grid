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
// The row axis and windows are committed before content size is emitted, so
// every instruction in a batch reports one geometry revision.

import type { SlotPoolManager } from "./slot-pool";
import type {
  HighlightManager,
  InstructionBatcher,
  ScrollVirtualizationManager,
  SortFilterManager,
  ViewportState,
} from "./managers";
import type { ColumnDefinition, SortDirection } from "./types";
import type { GridGeometryService } from "./geometry/grid-geometry";
import type { ColumnLayoutSnapshot, ColumnWindowSnapshot } from "./types/geometry";

// With scroll virtualization active a fast fling traverses several rows per
// frame; overscan below this leaves blank rows behind the fling.
const RECOMMENDED_SCALED_OVERSCAN = 10;

interface EmittedHeader {
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
  hasFilter: boolean;
}

export interface ViewSyncDeps<TData> {
  batcher: InstructionBatcher;
  scrollVirtualization: ScrollVirtualizationManager;
  slotPool: SlotPoolManager;
  viewport: ViewportState;
  sortFilter: SortFilterManager<TData>;
  highlight: HighlightManager<TData> | null;
  overscan: number;
  getColumns: () => ColumnDefinition[];
  /** Built after the managers; only read once construction has finished. */
  getGeometry: () => GridGeometryService;
  getTotalRows: () => number;
}

export class ViewSync<TData> {
  private readonly deps: ViewSyncDeps<TData>;
  private hasWarnedAboutScaledOverscan = false;
  /** Baseline a header must differ from to be re-emitted. */
  private readonly emittedHeaders = new Map<string, EmittedHeader>();
  private emittedHeaderIds: string[] = [];
  private emittedLayout: ColumnLayoutSnapshot | null = null;
  private emittedDefinitions: readonly ColumnDefinition[] | null = null;
  private emittedWindow: ColumnWindowSnapshot | null = null;
  private emittedWindowRevision = -1;

  constructor(deps: ViewSyncDeps<TData>) {
    this.deps = deps;
  }

  /**
   * Commit the row axis to the current row count before any window is read.
   * Data loads and row-count changes arrive here first.
   */
  private syncRowAxis(): void {
    this.deps.getGeometry().syncWindows();
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
      this.syncRowAxis();
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
      this.syncRowAxis();
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
      this.syncRowAxis();
      this.emitContentSize();
      this.emitHeaders();
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

  /**
   * A raw horizontal scroll: only the mounted column window can change, so no
   * row work, slot sync or visible-range instruction is produced, and no
   * batch is created when the range did not move. A correction is still
   * delivered because the sample may sit outside the reachable range.
   */
  syncColumnWindowOnly(emitScrollCorrection: () => void, hasScrollCorrection: () => boolean): void {
    const geometry = this.deps.getGeometry();
    geometry.refresh();
    const moved = geometry.syncColumnWindow();
    if (moved === false && hasScrollCorrection() === false) return;
    this.deps.batcher.start();
    try {
      emitScrollCorrection();
      if (moved) this.emitColumnWindow();
    } finally {
      this.deps.batcher.flush();
    }
  }

  /**
   * Publish the mounted column window. Every path that moves the window —
   * scroll, edit retention, layout change — funnels through here, so the
   * revision is committed and the instruction order inside the batch stays
   * uniform.
   */
  publishColumnWindow(): void {
    const geometry = this.deps.getGeometry();
    geometry.syncColumnWindow();
    this.emitColumnWindow();
  }

  /** Refresh the column window for a retention change and publish it. */
  syncEditRetention(): void {
    this.deps.batcher.start();
    try {
      this.publishColumnWindow();
    } finally {
      this.deps.batcher.flush();
    }
  }

  emitContentSize(): void {
    const { batcher, scrollVirtualization, viewport } = this.deps;
    const geometry = this.deps.getGeometry();
    const layout = geometry.getColumnLayout();
    // Captured after the layout resolves: both instructions report it.
    const revision = geometry.revision;
    batcher.emit({
      type: "SET_CONTENT_SIZE",
      width: layout.totalWidth,
      height: scrollVirtualization.getVirtualHeight(),
      viewportWidth: viewport.getViewportWidth(),
      viewportHeight: viewport.getViewportHeight(),
      rowsWrapperOffset: this.rowsWrapperOffset(),
      revision,
    });
    this.emitColumnLayout(layout, revision);
    this.emitColumnWindow();
    this.warnIfOverscanTooLowForScaling();
  }

  /**
   * Publish the mounted center window when it or its retained set changed.
   * Object identity is the change contract: the geometry service reuses the
   * same window while layout, range and retention are unchanged.
   */
  private emitColumnWindow(): void {
    const geometry = this.deps.getGeometry();
    const window = geometry.getColumnWindow();
    const revision = geometry.revision;
    if (window === this.emittedWindow && revision === this.emittedWindowRevision) return;
    this.emittedWindow = window;
    this.emittedWindowRevision = revision;
    this.deps.batcher.emit({ type: "SET_COLUMN_WINDOW", window, revision });
  }

  /**
   * Publish the displayed-column layout when it observably changed. The
   * instruction reports the committed batch revision; the snapshot keeps the
   * revision of its own last change.
   */
  private emitColumnLayout(layout: ColumnLayoutSnapshot, revision: number): void {
    const columns = this.deps.getColumns();
    // The column model builds a new array on every resolve, so its identity
    // covers any definition change, not only id/width/visibility.
    const isUnchanged = columns === this.emittedDefinitions && layout === this.emittedLayout;
    if (isUnchanged) return;
    this.emittedDefinitions = columns;
    this.emittedLayout = layout;
    this.deps.batcher.emit({
      type: "COLUMNS_CHANGED",
      columns: [...columns],
      layout,
      revision,
    });
  }

  private rowsWrapperOffset(): number {
    return this.deps.getGeometry().getRowGeometry().getMapper().wrapperOffset();
  }

  emitHeaders(): void {
    const { batcher, sortFilter } = this.deps;
    const columns = this.deps.getColumns();
    const sortInfoMap = sortFilter.getSortInfoMap();

    const currentIds: string[] = [];
    const currentIdSet = new Set<string>();
    for (const column of columns) {
      const columnId = column.colId ?? column.field;
      currentIds.push(columnId);
      currentIdSet.add(columnId);
      const sortInfo = sortInfoMap.get(columnId);
      const hasFilter = sortFilter.hasActiveFilter(columnId);
      if (this.headerIsUnchanged(columnId, column, sortInfo, hasFilter)) continue;
      this.emittedHeaders.set(columnId, {
        column,
        sortDirection: sortInfo?.direction,
        sortIndex: sortInfo?.index,
        hasFilter,
      });
      batcher.emit({
        type: "UPDATE_HEADER",
        columnId,
        column,
        sortDirection: sortInfo?.direction,
        sortIndex: sortInfo?.index,
        hasFilter,
      });
    }

    const removedIds = this.emittedHeaderIds.filter((id) => currentIdSet.has(id) === false);
    if (removedIds.length > 0) {
      batcher.emit({ type: "REMOVE_HEADERS", columnIds: removedIds });
      for (const id of removedIds) this.emittedHeaders.delete(id);
    }
    this.emittedHeaderIds = currentIds;
  }

  private headerIsUnchanged(
    columnId: string,
    column: ColumnDefinition,
    sortInfo: { direction?: SortDirection | null; index?: number } | undefined,
    hasFilter: boolean,
  ): boolean {
    const previous = this.emittedHeaders.get(columnId);
    if (previous === undefined) return false;
    return (
      previous.column === column &&
      previous.sortDirection === sortInfo?.direction &&
      previous.sortIndex === sortInfo?.index &&
      previous.hasFilter === hasFilter
    );
  }

  emitVisibleRange(): void {
    const { batcher } = this.deps;
    // The geometry window is half-open; the legacy instruction range is
    // inclusive, and an empty window is `{ start: 0, end: -1 }`.
    const window = this.deps.getGeometry().getVisibleRowWindow();
    const legacy = window.end > window.start
      ? { start: window.start, end: window.end - 1 }
      : { start: 0, end: -1 };
    batcher.emit({
      type: "UPDATE_VISIBLE_RANGE",
      start: legacy.start,
      end: legacy.end,
      rowsWrapperOffset: this.rowsWrapperOffset(),
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
