// @gp-grid/core/src/grid-core.ts

import type {
  GridCoreOptions,
  BatchInstructionListener,
  ColumnDefinition,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ViewRow,
  CellValue,
  DataSource,
  RowId,
  SortModel,
  SortDirection,
  FilterModel,
  ColumnFilterInput,
  EditState,
} from "./types";
import type { SelectionManager } from "./selection";
import { createGridGeometry, toReadonlyGeometry, type GridGeometryService } from "./geometry";
import type { GeometrySpace, CellBounds, ColumnLayoutMode, ColumnPin, GridGeometry } from "./types/geometry";
import type { FillManager } from "./fill";
import type { SlotPoolManager } from "./slot-pool";
import type { EditManager } from "./edit-manager";
import { InputHandler } from "./input-handler";
import type {
  HighlightManager,
  ScrollVirtualizationManager,
  SortFilterManager,
  ViewportState,
} from "./managers";
import { InstructionBatcher } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import { type GridCoreConfig, resolveGridCoreConfig } from "./grid-core-config";
import { buildGridManagers } from "./grid-core-managers";
import { ColumnModel } from "./column-model";
import {
  type ColumnCoreDeps,
  applyColumnPin,
  applyColumnStateReset,
  applyColumnStateUpdates,
  applySetColumns,
  readColumnState,
} from "./grid-core-columns";
import type { ViewSync } from "./grid-core-view-sync";
import {
  type ColumnOperationDeps,
  applyColumnMove,
  applyColumnResize,
  applyRowDragCommit,
} from "./grid-core-operations";

// =============================================================================
// GridCore
// =============================================================================

export class GridCore<TData = unknown> {
  // Options with defaults applied; immutable for the grid's lifetime
  private readonly config: GridCoreConfig<TData>;

  // Immutable caller definitions, live column state and resolved layout
  private readonly columnModel: ColumnModel;
  /** Single owner of column/row geometry; wrappers read this, never recompute. */
  public readonly geometry: GridGeometry;
  private readonly geometryService: GridGeometryService;

  // Instruction dispatch
  private readonly batcher = new InstructionBatcher();

  // Viewport state
  private readonly viewport: ViewportState;
  // Fractional DOM scrollTop set by the synthetic touch scroller (see
  // setScrollTopOverride); null when native scroll positions are in charge.
  private scrollTopOverride: number | null = null;

  // Data state
  private readonly rowData: RowDataManager<TData>;

  // Managers
  public readonly selection: SelectionManager;
  public readonly fill: FillManager;
  public readonly input: InputHandler<TData>;
  public readonly highlight: HighlightManager<TData> | null;
  public readonly sortFilter: SortFilterManager<TData>;
  private readonly slotPool: SlotPoolManager;
  private readonly editManager: EditManager;
  private readonly scrollVirtualization: ScrollVirtualizationManager;

  // Derived-view emission: content size, headers, visible range, slots
  private readonly view: ViewSync<TData>;

  // Lifecycle state
  private isDestroyed: boolean = false;

  constructor(options: GridCoreOptions<TData>) {
    this.config = resolveGridCoreConfig(options);
    this.columnModel = new ColumnModel(options.columns);

    const managers = buildGridManagers<TData>({
      batcher: this.batcher,
      config: this.config,
      getColumns: () => this.columnModel.getLayout(),
      getGeometry: () => this.geometryService,
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
    });
    this.rowData = managers.rowData;
    this.selection = managers.selection;
    this.highlight = managers.highlight;
    this.fill = managers.fill;
    this.scrollVirtualization = managers.scrollVirtualization;
    this.viewport = managers.viewport;
    this.slotPool = managers.slotPool;
    this.editManager = managers.editManager;
    this.sortFilter = managers.sortFilter;
    this.view = managers.view;

    this.geometryService = createGridGeometry(
      {
        getRowCount: () => this.rowData.getTotalRows(),
        getRowHeight: () => this.config.rowHeight,
        getOverscan: () => this.config.overscan,
        getColumnOverscan: () => this.config.columnOverscan,
        getColumns: () => this.columnModel.getLayout(),
        isWidthOverridden: (layoutIndex) => this.columnModel.isWidthOverriddenAt(layoutIndex),
        getViewport: () => ({
          width: this.viewport.getViewportWidth(),
          height: this.viewport.getViewportHeight(),
          scrollLeft: this.viewport.getScrollLeft(),
          scrollTop: this.scrollTopOverride ?? this.viewport.getScrollTop(),
        }),
        getScrollMapping: () => ({
          getDomScrollTop: () => this.scrollTopOverride ?? this.viewport.getScrollTop(),
          toDomScrollTop: (logical) => this.scrollVirtualization.toDomScrollTop(logical),
          toLogicalScrollTop: (dom) => this.scrollVirtualization.toLogicalScrollTop(dom),
          isScalingActive: () => this.scrollVirtualization.isScalingActive(),
          getMaxLogicalScrollTop: () => this.scrollVirtualization.getMaxLogicalScrollTop(),
        }),
      },
      this.config.columnLayout,
    );
    this.geometry = toReadonlyGeometry(this.geometryService);
    this.geometryService.refresh();

    this.input = new InputHandler(this);
  }

  // ===========================================================================
  // Instruction System
  // ===========================================================================

  /**
   * Subscribe to batched instructions for efficient React/Vue state updates.
   * Batch listeners receive arrays of instructions instead of individual ones.
   */
  onBatchInstruction(listener: BatchInstructionListener): () => void {
    return this.batcher.subscribe(listener);
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the grid and load initial data.
   */
  async initialize(): Promise<void> {
    await this.rowData.loadInitial();
    this.view.reconcile();
  }

  // ===========================================================================
  // Viewport Management
  // ===========================================================================

  /**
   * Update viewport measurements and sync slots.
   * When scroll virtualization is active, maps the DOM scroll position to the actual row position.
   */
  setViewport(
    scrollTop: number,
    scrollLeft: number,
    width: number,
    height: number,
  ): void {
    const previousTop = this.viewport.getScrollTop();
    const previousHeight = this.viewport.getViewportHeight();
    const { changed, viewportSizeChanged } = this.viewport.update(
      this.scrollTopOverride ?? scrollTop,
      scrollLeft,
      width,
      height,
    );
    if (!changed) return;

    // A raw horizontal scroll cannot change which rows are visible: it only
    // moves the mounted center window, and an unchanged range emits nothing.
    // A vertical move still has to publish the column window when both axes
    // moved in one sample.
    const verticalWork =
      viewportSizeChanged || previousHeight !== height || previousTop !== this.viewport.getScrollTop();
    if (verticalWork === false) {
      this.view.syncColumnWindowOnly(
        () => this.emitScrollCorrection(),
        () => this.hasScrollCorrection(),
      );
      return;
    }

    // One batch: adapters reset the pending scroll per batch, so a correction
    // delivered ahead of the row sync would be dropped before it is applied.
    // Geometry was committed once by `refreshGeometry`, so every instruction
    // in this batch reports the same revision; the window is published here
    // because a vertical-only slot sync does not re-emit content size.
    this.batcher.start();
    try {
      this.refreshGeometry();
      this.rowData.requestVisibleRows();
      this.view.syncVisibleRows(viewportSizeChanged);
      this.view.publishColumnWindow();
    } finally {
      this.batcher.flush();
    }
  }

  /**
   * Refresh the committed geometry dependencies before a batch captures its
   * revision. The column window is committed here too, so a viewport or
   * layout change publishes one geometry revision, not one per emitter. Also
   * corrects native scroll that a data/layout change left outside the
   * reachable range.
   */
  private refreshGeometry(): void {
    this.geometryService.refresh();
    this.geometryService.syncColumnWindow();
    this.emitScrollCorrection();
  }

  /** Geometry already answers from the clamped sample; this moves the DOM to it. */
  private emitScrollCorrection(): void {
    if (this.hasScrollCorrection() === false) return;
    const sampleTop = this.scrollTopOverride ?? this.viewport.getScrollTop();
    const sampleLeft = this.viewport.getScrollLeft();
    const { scrollTop, scrollLeft } = this.geometryService.getEffectiveScroll();
    this.batcher.emit({
      type: "SCROLL_TO",
      scrollTop: scrollTop === sampleTop ? undefined : scrollTop,
      scrollLeft: scrollLeft === sampleLeft ? undefined : scrollLeft,
    });
  }

  private hasScrollCorrection(): boolean {
    const sampleTop = this.scrollTopOverride ?? this.viewport.getScrollTop();
    const sampleLeft = this.viewport.getScrollLeft();
    const { scrollTop, scrollLeft } = this.geometryService.getEffectiveScroll();
    return scrollTop !== sampleTop || scrollLeft !== sampleLeft;
  }

  /**
   * Switch the displayed-width policy at runtime. A no-op setter emits nothing.
   */
  setColumnLayout(mode: ColumnLayoutMode): void {
    if (this.geometryService.getColumnLayoutMode() === mode) return;
    this.geometryService.setColumnLayoutMode(mode);
    this.batcher.start();
    try {
      this.refreshGeometry();
      this.view.emitContentSize();
      this.view.emitHeaders();
    } finally {
      this.batcher.flush();
    }
  }

  /** Resolve a cell to viewport/content geometry by identity. */
  getCellBounds(
    rowId: RowId,
    columnId: string,
    space: GeometrySpace = "viewport",
  ): CellBounds | undefined {
    const viewIndex = this.resolveViewIndex(rowId);
    if (viewIndex === undefined) return undefined;
    const layoutIndex = this.geometry
      .getColumnLayout()
      .columns.find((column) => column.columnId === columnId)?.layoutIndex;
    if (layoutIndex === undefined) return undefined;
    return this.geometry.getCellBounds(viewIndex, layoutIndex, space);
  }

  /**
   * Resolve a row identity without scanning a remote or columnar source:
   * the bounded current window is checked by id, then the resident records.
   */
  private resolveViewIndex(rowId: RowId): number | undefined {
    const window = this.geometry.getRowWindow();
    for (let viewIndex = window.start; viewIndex < window.end; viewIndex++) {
      if (this.rowData.getRowId(viewIndex) === rowId) return viewIndex;
    }
    const resident = this.rowData.findViewIndexById(rowId);
    return resident === -1 ? undefined : resident;
  }

  // ===========================================================================
  // Sort & Filter (facade methods delegating to SortFilterManager)
  // ===========================================================================

  async setSort(
    colId: string,
    direction: SortDirection | null,
    addToExisting: boolean = false,
  ): Promise<void> {
    if (this.rowData.isLoading()) return;
    return this.sortFilter.setSort(colId, direction, addToExisting);
  }

  async setFilter(colId: string, filter: ColumnFilterInput | string | null): Promise<void> {
    if (this.rowData.isLoading()) return;
    return this.sortFilter.setFilter(colId, filter);
  }

  hasActiveFilter(colId: string): boolean {
    return this.sortFilter.hasActiveFilter(colId);
  }

  /**
   * Open a column filter popup.
   * Adapters can skip distinct-value computation when their popup only uses
   * condition inputs, such as number and date filters.
   */
  openFilterPopup(
    colIndex: number,
    anchorRect: { top: number; left: number; width: number; height: number },
    computeDistinctValues: boolean = true,
  ): void {
    if (this.rowData.isLoading()) return;
    this.sortFilter.openFilterPopup(
      colIndex,
      anchorRect,
      computeDistinctValues,
    );
  }

  closeFilterPopup(): void {
    this.sortFilter.closeFilterPopup();
  }

  getSortModel(): SortModel[] {
    return this.sortFilter.getSortModel();
  }

  getFilterModel(): FilterModel {
    return this.sortFilter.getFilterModel();
  }

  // ===========================================================================
  // Editing
  // ===========================================================================

  startEdit(row: number, col: number): boolean {
    // The edit manager owns the read-only check so a refused, editable cell
    // reports through the shared write-rejection diagnostic. Retention is
    // registered only for an edit that will open, inside the same batch that
    // publishes START_EDIT and the window mounting its editor (B7): a refused
    // edit neither drops the current editor's keep-alive nor emits anything.
    if (this.editManager.canEdit(col) === false) return this.editManager.startEdit(row, col);
    const columnId = this.columnModel.idAt(col);
    this.batcher.start();
    try {
      if (columnId !== undefined) this.retainEditColumn(columnId);
      return this.editManager.startEdit(row, col);
    } finally {
      this.batcher.flush();
    }
  }

  /**
   * Open a read-only peek overlay on a cell. The default cell renderer is
   * shown in a multi-line container so long values are fully visible.
   * Returns true if the peek opened (column must be `peekable !== false`
   * and not currently being edited).
   */
  startPeek(row: number, col: number): boolean {
    const column = this.columnModel.columnAt(col);
    if (!column || column.peekable === false) return false;
    return this.editManager.startPeek(row, col);
  }

  /** Close any active peek overlay. */
  stopPeek(): void {
    this.editManager.stopPeek();
  }

  getPeekState(): { row: number; col: number } | null {
    return this.editManager.getPeekState();
  }

  /** `editId` is the open edit's session token; a stale one is ignored. */
  updateEditValue(value: CellValue, editId?: number): void {
    this.editManager.updateValue(value, editId);
  }

  commitEdit(editId?: number): void {
    this.editManager.commit(editId);
  }

  cancelEdit(editId?: number): void {
    this.editManager.cancel(editId);
  }

  pasteClipboardText(text: string): boolean {
    if (this.editManager.getState()) return false;

    const result = this.selection.pasteClipboardText(text);
    if (result.changedCells.length > 0) {
      this.refreshSlotData();
    }

    return result.handled;
  }

  getEditState(): EditState | null {
    return this.editManager.getState();
  }

  // ===========================================================================
  // Cell Value Access
  // ===========================================================================

  getCellValue(row: number, col: number): CellValue {
    return this.rowData.getCellValue(row, col);
  }

  /**
   * Read a raw source field at a view row, independent of the displayed
   * columns. Lets a cell renderer read another field that has no grid column,
   * including for record-less (columnar) rows.
   */
  getFieldValue(viewIndex: number, field: string): CellValue {
    return this.rowData.getFieldValue(viewIndex, field);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    this.rowData.setCellValue(row, col, value);
  }

  /**
   * Stable identity for a view row when the source exposes one. Columnar
   * sources resolve it lazily; no per-row ID table is built on bind.
   */
  getRowId(rowIndex: number): RowId | undefined {
    return this.rowData.getRowId(rowIndex);
  }

  /**
   * False when the bound source declares itself read-only. Every write path
   * (edit, paste, fill, direct setter, row move) is refused centrally.
   */
  isWritable(): boolean {
    return this.rowData.isWritable();
  }

  // ===========================================================================
  // Layout Helpers
  // ===========================================================================

  private clearSelectionIfInvalid(maxValidRow: number): void {
    const activeCell = this.selection.getActiveCell();
    if (activeCell && activeCell.row >= maxValidRow) {
      this.selection.clearSelection();
    }
  }

  private columnOperationDeps(): ColumnOperationDeps<TData> {
    return {
      getLayout: () => this.columnModel.getLayout(),
      setColumnWidth: (columnId, width) => this.columnModel.setWidth(columnId, width),
      moveColumn: (fromIndex, toIndex) => this.columnModel.move(fromIndex, toIndex),
      columnModel: this.columnModel,
      selection: this.selection,
      editManager: this.editManager,
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
      refreshGeometry: () => this.refreshGeometry(),
      batcher: this.batcher,
      view: this.view,
    };
  }

  // ===========================================================================
  // Column & Row Interaction
  // ===========================================================================

  /**
   * Set the displayed width of a column and recompute layout. `width` is the
   * post-redistribution displayed width — the stored column state width is
   * back-solved so the column ends up exactly `width` pixels wide.
   */
  setColumnWidth(colIndex: number, width: number): void {
    const applied = applyColumnResize(
      colIndex,
      width,
      this.columnOperationDeps(),
    );
    if (applied) {
      this.config.onColumnResized?.({
        columnId: applied.columnId,
        width: applied.width,
        viewIndex: colIndex,
      });
    }
  }

  /**
   * Move a column from one index to another and recompute layout.
   */
  moveColumn(fromIndex: number, toIndex: number): void {
    const applied = applyColumnMove(fromIndex, toIndex, this.columnOperationDeps());
    if (applied === null) return;
    if (applied.pinChanged) {
      this.config.onColumnPinned?.({
        columnId: applied.columnId,
        pinned: applied.pinned ?? null,
      });
    }
    this.config.onColumnMoved?.({
      columnId: applied.columnId,
      fromViewIndex: applied.fromViewIndex,
      toViewIndex: applied.toViewIndex,
    });
  }

  /**
   * Pin a column against the inline start or end edge, or unpin it with
   * `null`. Only a pin change moves a column between regions; the base order
   * is untouched, so unpinning returns it to its base-order slot.
   */
  setColumnPinned(columnId: string, pinned: ColumnPin | null): void {
    if (applyColumnPin(this.columnDeps(), columnId, pinned) === false) return;
    this.config.onColumnPinned?.({ columnId, pinned });
  }

  /**
   * Commit a row drag operation. Reorders data if the data source supports it,
   * then invokes the onRowDragEnd callback.
   *
   * Optimized: instead of a full refresh (fetchData + rebuild all slots), we
   * update the cachedRows map in-place to mirror the splice the data source
   * performed, then only update the affected slots.
   */
  commitRowDrag(sourceIndex: number, targetIndex: number): void {
    if (this.rowData.isWritable() === false) {
      this.rowData.rejectWrite(sourceIndex, -1, "row-move");
      return;
    }
    // Read identity first: the commit reorders the cache under these indices.
    const rowId = this.rowData.getRowId(sourceIndex) ?? sourceIndex;
    applyRowDragCommit(sourceIndex, targetIndex, {
      dataSource: this.rowData.getDataSource(),
      cachedRows: this.rowData.getCachedRows(),
      slotPool: this.slotPool,
      highlight: this.highlight,
    });
    this.config.onRowDragEnd?.({
      rowId,
      fromViewIndex: sourceIndex,
      toViewIndex: targetIndex,
    });
  }

  /**
   * Whether the entire row is draggable.
   */
  isRowDragEntireRow(): boolean {
    return this.config.rowDragEntireRow;
  }

  // ===========================================================================
  // Public Accessors
  // ===========================================================================

  getColumns(): ColumnDefinition[] {
    return this.columnModel.getLayout();
  }

  /** @deprecated Use `geometry.getColumnLayout()`; removed in 1.1. */
  getColumnPositions(): number[] {
    const layout = this.geometry.getColumnLayout();
    return [...layout.columns.map((column) => column.offset), layout.totalWidth];
  }

  /** Number of displayed view rows (after sort/filter). */
  getRowCount(): number {
    return this.rowData.getTotalRows();
  }

  getRowHeight(): number {
    return this.config.rowHeight;
  }

  getHeaderHeight(): number {
    return this.config.headerHeight;
  }

  getTotalWidth(): number {
    return this.geometry.getColumnLayout().totalWidth;
  }

  getTotalHeight(): number {
    return this.scrollVirtualization.getVirtualHeight();
  }

  isScalingActive(): boolean {
    return this.scrollVirtualization.isScalingActive();
  }

  /**
   * Maximum accumulated touch-fling velocity (logical px/ms) used by the
   * synthetic scroller while scroll virtualization is active.
   */
  getMaxFlingVelocity(): number {
    return this.config.maxFlingVelocity;
  }

  /**
   * Override the DOM scrollTop that setViewport uses, at sub-pixel
   * resolution. When scroll virtualization compresses the DOM scroll space,
   * the browser quantizes scrollTop to device pixels — at high compression
   * one DOM pixel can span a full row of logical scroll, so positions
   * derived from native scroll events step row-by-row. The synthetic touch
   * scroller sets its fractional position here so native scroll events
   * (which fire with the quantized value) cannot clobber it. Pass null to
   * return to native scroll positions.
   * @internal
   */
  setScrollTopOverride(domScrollTop: number | null): void {
    this.scrollTopOverride = domScrollTop;
  }

  getScrollRatio(): number {
    return this.scrollVirtualization.getScrollRatio();
  }

  /**
   * @deprecated Inclusive range; use `geometry.getVisibleRowWindow()` (half-open).
   * Owned by the core maintainer and removed in 1.1.
   */
  getVisibleRowRange(): { start: number; end: number } {
    const window = this.geometry.getVisibleRowWindow();
    return window.end > window.start
      ? { start: window.start, end: window.end - 1 }
      : { start: 0, end: -1 };
  }

  /** Used structurally by `scrollCellIntoView` in the framework wrappers. */
  getRowData(rowIndex: number): TData | undefined {
    return this.rowData.getRowData(rowIndex);
  }

  /**
   * Whether a view row exists and can be rendered. Distinct from having a
   * record: a columnar row exists with no source record, and a `null` cell
   * value is still a value.
   */
  hasRow(viewIndex: number): boolean {
    return this.rowData.hasRow(viewIndex);
  }

  /**
   * A displayed row and its identity, built on request. Returns `undefined`
   * when the view row does not exist; a record-less row has `record` absent.
   * Without a source identity `id` is the view index, valid until the next
   * sort, filter or refresh.
   */
  getViewRow(viewIndex: number): ViewRow<TData> | undefined {
    if (this.rowData.hasRow(viewIndex) === false) return undefined;
    const record = this.rowData.getRowData(viewIndex);
    return {
      kind: "record",
      id: this.rowData.getRowId(viewIndex) ?? viewIndex,
      viewIndex,
      record,
    };
  }

  /**
   * Look up a source record by stable identity. Answers for rows currently
   * resident in the grid and for sources that implement a direct lookup;
   * server and columnar windows outside the resident set are not searched.
   */
  getRecordById(rowId: RowId): TData | undefined {
    return this.rowData.getRecordById(rowId);
  }

  /**
   * Current assignment generation for a view row, or -1 when no slot serves
   * it. Renderers tag async callbacks with this and drop stale ones.
   */
  getSlotGeneration(rowIndex: number): number {
    return this.slotPool.getSlotGeneration(rowIndex);
  }

  /** Whether `generation` still matches the slot currently serving a row. */
  isSlotGenerationCurrent(rowIndex: number, generation: number): boolean {
    return this.slotPool.getSlotGeneration(rowIndex) === generation;
  }

  // ===========================================================================
  // Data Updates
  // ===========================================================================

  /**
   * Refresh data from the data source.
   */
  async refresh(): Promise<void> {
    await this.rowData.loadInitial();
    this.view.reconcile();
  }

  /**
   * Fast-path refresh for transaction-based mutations.
   * Only re-fetches the visible window instead of all rows.
   * Use this when data was mutated via MutableDataSource transactions.
   */
  async refreshFromTransaction(): Promise<void> {
    await this.rowData.refreshFromTransaction();
    this.view.reconcile();
  }

  /**
   * Refresh slot display without refetching data.
   * Useful after in-place data modifications like fill operations.
   */
  refreshSlotData(): void {
    this.slotPool.refreshAllSlots();
  }

  /**
   * Update the data source and refresh.
   * Preserves grid state (sort, filter, scroll position).
   * Cancels any active edit and clamps selection to valid range.
   */
  async setDataSource(dataSource: DataSource<TData>): Promise<void> {
    if (this.editManager.getState()) {
      this.editManager.cancel();
    }
    this.rowData.setDataSource(dataSource);
    await this.refresh();
    this.clearSelectionIfInvalid(this.rowData.getTotalRows());
  }

  /**
   * Update columns and reconcile by column id in one instruction batch.
   * Retained IDs keep user state, sort and filter; removed IDs drop headers,
   * state and caches; new IDs take definition defaults.
   */
  setColumns(columns: ColumnDefinition[]): void {
    applySetColumns(this.columnDeps(), columns);
  }

  /**
   * Apply explicit per-column state. Values win over retained user state and
   * over definition defaults.
   */
  setColumnState(updates: ColumnStateUpdate[]): void {
    applyColumnStateUpdates(this.columnDeps(), updates);
  }

  /**
   * Drop user column state. With no IDs, every column returns to its
   * definition defaults; with IDs, only those columns reset.
   */
  resetColumnState(columnIds?: string[]): void {
    applyColumnStateReset(this.columnDeps(), columnIds);
  }

  /** Effective per-column width, visibility and order, in layout order. */
  getColumnState(): ColumnStateSnapshot[] {
    return readColumnState(this.columnDeps());
  }

  private columnDeps(): ColumnCoreDeps<TData> {
    return {
      batcher: this.batcher,
      columnModel: this.columnModel,
      selection: this.selection,
      editManager: this.editManager,
      sortFilter: this.sortFilter,
      rowData: this.rowData,
      view: this.view,
      getColumnLayout: () => this.geometry.getColumnLayout(),
      refreshGeometry: () => this.refreshGeometry(),
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
      reloadAfterSchemaChange: () => this.refresh(),
    };
  }

  /** Bounded keep-alive for the edited column (B7), published as a batch. */
  private retainEditColumn(columnId: string | null): void {
    this.geometryService.retainColumns(
      "edit",
      columnId === null ? [] : [columnId],
    );
    this.view.syncEditRetention();
  }

  /**
   * Destroy the grid core and release all references.
   * Call this before discarding the GridCore to ensure proper cleanup.
   * This method is idempotent - safe to call multiple times.
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Destroy child managers
    this.slotPool.destroy();
    this.highlight?.destroy();
    this.sortFilter.destroy();
    this.rowData.destroy();

    // Clear listeners
    this.batcher.clearListeners();

  }
}
