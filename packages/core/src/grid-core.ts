// @gp-grid/core/src/grid-core.ts

import type {
  GridCoreOptions,
  BatchInstructionListener,
  ColumnDefinition,
  CellValue,
  CellValueChangedEvent,
  DataSource,
  RowId,
  SortModel,
  SortDirection,
  FilterModel,
  ColumnFilterModel,
  EditState,
} from "./types";
import type { SelectionManager } from "./selection";
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
import {
  computeColumnPositions,
} from "./utils";
import { buildGridManagers } from "./grid-core-managers";
import { RowDataManager } from "./managers/row-data-manager";
import {
  emitContentSize as emitContentSizeFn,
  emitHeaders as emitHeadersFn,
  emitVisibleRange as emitVisibleRangeFn,
} from "./grid-core-emitters";
import {
  applyColumnMove,
  applyColumnResize,
  applyRowDragCommit,
} from "./grid-core-operations";

// =============================================================================
// Constants
// =============================================================================

// With scroll virtualization active a fast fling traverses several rows per
// frame; overscan below this leaves blank rows behind the fling.
const RECOMMENDED_SCALED_OVERSCAN = 10;

// Default momentum ceiling for the synthetic touch scroller, expressed in
// rows per second and converted to logical px/ms via the row height.
const DEFAULT_FLING_ROWS_PER_SECOND = 20_000;

// =============================================================================
// GridCore
// =============================================================================

export class GridCore<TData = unknown> {
  // Configuration
  private columns: ColumnDefinition[];
  private readonly rowHeight: number;
  private readonly headerHeight: number;
  private readonly overscan: number;
  private readonly maxFlingVelocity: number;
  private readonly sortingEnabled: boolean;
  private readonly getRowId?: (row: TData) => RowId;
  private readonly onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  private readonly rowDragEntireRow: boolean;
  private readonly onRowDragEnd?: (sourceIndex: number, targetIndex: number) => void;
  private readonly onColumnResized?: (colIndex: number, newWidth: number) => void;
  private readonly onColumnMoved?: (fromIndex: number, toIndex: number) => void;

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

  // Column positions (computed)
  private columnPositions: number[] = [];

  // Instruction dispatch
  private readonly batcher = new InstructionBatcher();

  // Scroll virtualization
  private readonly scrollVirtualization: ScrollVirtualizationManager;

  // Lifecycle state
  private isDestroyed: boolean = false;
  private hasWarnedAboutScaledOverscan: boolean = false;

  constructor(options: GridCoreOptions<TData>) {
    this.columns = options.columns;
    this.rowHeight = options.rowHeight;
    this.headerHeight = options.headerHeight ?? options.rowHeight;
    this.overscan = options.overscan ?? 3;
    this.maxFlingVelocity = options.maxFlingVelocity ??
      (DEFAULT_FLING_ROWS_PER_SECOND * this.rowHeight) / 1000;
    this.sortingEnabled = options.sortingEnabled ?? true;
    this.getRowId = options.getRowId;
    this.onCellValueChanged = options.onCellValueChanged;
    this.rowDragEntireRow = options.rowDragEntireRow ?? false;
    this.onRowDragEnd = options.onRowDragEnd;
    this.onColumnResized = options.onColumnResized;
    this.onColumnMoved = options.onColumnMoved;
    if (this.onCellValueChanged && !this.getRowId) {
      throw new Error("getRowId is required when onCellValueChanged is provided");
    }

    this.computeColumnPositions();

    let viewport!: ViewportState;
    let slotPool!: SlotPoolManager;
    let sortFilter!: SortFilterManager<TData>;
    this.rowData = new RowDataManager<TData>({
      dataSource: options.dataSource,
      rowLoading: options.rowLoading,
      batcher: this.batcher,
      getColumns: () => this.columns,
      getSortModel: () => sortFilter.getSortModel(),
      getFilterModel: () => sortFilter.getFilterModel(),
      getRowHeight: () => this.rowHeight,
      getOverscan: () => this.overscan,
      getScrollTop: () => viewport.getScrollTop(),
      getViewportHeight: () => viewport.getViewportHeight(),
      onCellValueChanged: this.onCellValueChanged,
      getRowId: this.getRowId,
      syncSlots: () => slotPool.syncSlots(),
      emitVisibleRange: () => this.emitVisibleRange(),
      emitContentSize: () => this.emitContentSize(),
    });

    const managers = buildGridManagers<TData>({
      batcher: this.batcher,
      highlighting: options.highlighting,
      getColumns: () => this.columns,
      getCachedRows: () => this.rowData.getCachedRows(),
      getTotalRows: () => this.rowData.getTotalRows(),
      getRowHeight: () => this.rowHeight,
      getHeaderHeight: () => this.headerHeight,
      getOverscan: () => this.overscan,
      getSortingEnabled: () => this.sortingEnabled,
      getCellValue: (row, col) => this.getCellValue(row, col),
      setCellValue: (row, col, value) => this.setCellValue(row, col, value),
      emitContentSize: () => this.emitContentSize(),
      emitHeaders: () => this.emitHeaders(),
      fetchData: () => this.rowData.loadInitial(),
    });
    this.selection = managers.selection;
    this.highlight = managers.highlight;
    this.fill = managers.fill;
    this.scrollVirtualization = managers.scrollVirtualization;
    this.viewport = managers.viewport;
    this.slotPool = managers.slotPool;
    this.editManager = managers.editManager;
    this.sortFilter = managers.sortFilter;
    viewport = this.viewport;
    slotPool = this.slotPool;
    sortFilter = this.sortFilter;

    this.input = new InputHandler(this, {
      getHeaderHeight: () => this.headerHeight,
      getRowHeight: () => this.rowHeight,
      getColumnPositions: () => this.columnPositions,
      getColumnCount: () => this.columns.length,
    });
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
    this.slotPool.syncSlots();
    this.emitContentSize();
    this.emitHeaders();
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
    const { changed, viewportSizeChanged } = this.viewport.update(
      this.scrollTopOverride ?? scrollTop,
      scrollLeft,
      width,
      height,
    );
    if (!changed) return;

    this.rowData.requestVisibleRows();
    this.slotPool.syncSlots();
    this.emitVisibleRange();
    if (viewportSizeChanged) this.emitContentSize();
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

  async setFilter(colId: string, filter: ColumnFilterModel | string | null): Promise<void> {
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

  startEdit(row: number, col: number): void {
    this.editManager.startEdit(row, col);
  }

  /**
   * Open a read-only peek overlay on a cell. The default cell renderer is
   * shown in a multi-line container so long values are fully visible.
   * Returns true if the peek opened (column must be `peekable !== false`
   * and not currently being edited).
   */
  startPeek(row: number, col: number): boolean {
    const column = this.columns[col];
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

  updateEditValue(value: CellValue): void {
    this.editManager.updateValue(value);
  }

  commitEdit(): void {
    this.editManager.commit();
  }

  cancelEdit(): void {
    this.editManager.cancel();
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

  setCellValue(row: number, col: number, value: CellValue): void {
    this.rowData.setCellValue(row, col, value);
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

  private computeColumnPositions(): void {
    this.columnPositions = computeColumnPositions(this.columns);
  }

  private emitContentSize(): void {
    emitContentSizeFn({
      batcher: this.batcher,
      scrollVirtualization: this.scrollVirtualization,
      slotPool: this.slotPool,
      viewport: this.viewport,
      columnPositions: this.columnPositions,
    });
    this.warnIfOverscanTooLowForScaling();
  }

  /**
   * One-time advisory when scroll virtualization kicks in with a small
   * overscan: momentum flings move several rows per frame at that scale,
   * and a small overscan shows blank rows behind the fling.
   */
  private warnIfOverscanTooLowForScaling(): void {
    if (this.hasWarnedAboutScaledOverscan) return;
    if (this.scrollVirtualization.isScalingActive() === false) return;
    this.hasWarnedAboutScaledOverscan = true;
    if (this.overscan >= RECOMMENDED_SCALED_OVERSCAN) return;
    console.warn(
      `[gp-grid] Scroll virtualization is active (${this.rowData.getTotalRows().toLocaleString()} rows) ` +
      `but overscan is ${this.overscan}. Fast momentum scrolling can outrun rendering and show blank rows ` +
      `at this scale — set the overscan option to 10–12.`,
    );
  }

  private emitHeaders(): void {
    emitHeadersFn({
      batcher: this.batcher,
      sortFilter: this.sortFilter,
      columns: this.columns,
    });
  }

  private emitVisibleRange(): void {
    emitVisibleRangeFn({
      batcher: this.batcher,
      scrollVirtualization: this.scrollVirtualization,
      slotPool: this.slotPool,
    });
  }

  // ===========================================================================
  // Column & Row Interaction
  // ===========================================================================

  /**
   * Set the displayed width of a column and recompute layout. `width` is the
   * post-redistribution displayed width — the stored `column.width` is
   * back-solved so the column ends up exactly `width` pixels wide.
   */
  setColumnWidth(colIndex: number, width: number): void {
    applyColumnResize(colIndex, width, this.viewport.getViewportWidth(), {
      batcher: this.batcher,
      slotPool: this.slotPool,
      refreshSlots: "sync",
      computeColumnPositions: () => this.computeColumnPositions(),
      emitContentSize: () => this.emitContentSize(),
      emitHeaders: () => this.emitHeaders(),
      columns: this.columns,
      onComplete: () => this.onColumnResized?.(colIndex, width),
    });
  }

  /**
   * Move a column from one index to another and recompute layout.
   */
  moveColumn(fromIndex: number, toIndex: number): void {
    const adjustedTo = applyColumnMove(fromIndex, toIndex, {
      batcher: this.batcher,
      slotPool: this.slotPool,
      refreshSlots: "all",
      computeColumnPositions: () => this.computeColumnPositions(),
      emitContentSize: () => this.emitContentSize(),
      emitHeaders: () => this.emitHeaders(),
      columns: this.columns,
      onComplete: () => { },
    });
    if (adjustedTo !== null) this.onColumnMoved?.(fromIndex, adjustedTo);
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
    applyRowDragCommit(sourceIndex, targetIndex, {
      dataSource: this.rowData.getDataSource(),
      cachedRows: this.rowData.getCachedRows(),
      slotPool: this.slotPool,
      highlight: this.highlight,
    });
    this.onRowDragEnd?.(sourceIndex, targetIndex);
  }

  /**
   * Whether the entire row is draggable.
   */
  isRowDragEntireRow(): boolean {
    return this.rowDragEntireRow;
  }

  // ===========================================================================
  // Public Accessors
  // ===========================================================================

  getColumns(): ColumnDefinition[] {
    return this.columns;
  }

  getColumnPositions(): number[] {
    return [...this.columnPositions];
  }

  getRowCount(): number {
    return this.rowData.getTotalRows();
  }

  getRowHeight(): number {
    return this.rowHeight;
  }

  getHeaderHeight(): number {
    return this.headerHeight;
  }

  getTotalWidth(): number {
    return this.columnPositions.at(- 1) ?? 0;
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
    return this.maxFlingVelocity;
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

  getVisibleRowRange(): { start: number; end: number } {
    return this.scrollVirtualization.getVisibleRowRange();
  }

  /** Used structurally by `scrollCellIntoView` in the framework wrappers. */
  getScrollTopForRow(rowIndex: number): number {
    return this.scrollVirtualization.getScrollTopForRow(rowIndex);
  }

  getRowIndexAtDisplayY(viewportY: number, virtualScrollTop: number): number {
    return this.scrollVirtualization.getRowIndexAtDisplayY(
      viewportY,
      virtualScrollTop,
    );
  }

  /**
   * Get the translateY position for a row inside the rows wrapper.
   * Accounts for scroll virtualization (compressed coordinates).
   */
  getRowTranslateY(rowIndex: number): number {
    return this.slotPool.getRowTranslateYForIndex(rowIndex);
  }

  getRowData(rowIndex: number): TData | undefined {
    return this.rowData.getRowData(rowIndex);
  }

  // ===========================================================================
  // Data Updates
  // ===========================================================================

  /**
   * Refresh data from the data source.
   */
  async refresh(): Promise<void> {
    await this.rowData.loadInitial();
    this.highlight?.clearAllCaches();
    // refreshAllSlots (not syncSlots) ensures stale slot data is re-read
    // when totalRows didn't change but row contents did.
    this.slotPool.refreshAllSlots();
    this.emitContentSize();
    this.emitVisibleRange();
  }

  /**
   * Fast-path refresh for transaction-based mutations.
   * Only re-fetches the visible window instead of all rows.
   * Use this when data was mutated via MutableDataSource transactions.
   */
  async refreshFromTransaction(): Promise<void> {
    await this.rowData.refreshFromTransaction();
    this.highlight?.clearAllCaches();
    this.slotPool.refreshAllSlots();
    this.emitContentSize();
    this.emitVisibleRange();
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
   * Update columns and recompute layout.
   */
  setColumns(columns: ColumnDefinition[]): void {
    this.columns = columns;
    this.computeColumnPositions();
    this.emitContentSize();
    this.emitHeaders();
    this.slotPool.syncSlots();
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
