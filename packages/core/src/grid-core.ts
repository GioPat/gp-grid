// @gp-grid/core/src/grid-core.ts

import type {
  GridCoreOptions,
  BatchInstructionListener,
  ColumnDefinition,
  CellValue,
  DataSource,
  SortModel,
  SortDirection,
  FilterModel,
  ColumnFilterInput,
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
import { computeColumnPositions } from "./utils";
import type { RowDataManager } from "./managers/row-data-manager";
import { type GridCoreConfig, resolveGridCoreConfig } from "./grid-core-config";
import { buildGridManagers } from "./grid-core-managers";
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

  // Columns are the one option that changes after construction
  private columns: ColumnDefinition[];
  private columnPositions: number[] = [];

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
    this.columns = options.columns;
    this.computeColumnPositions();

    const managers = buildGridManagers<TData>({
      batcher: this.batcher,
      config: this.config,
      getColumns: () => this.columns,
      getColumnPositions: () => this.columnPositions,
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

    this.input = new InputHandler(this, {
      getHeaderHeight: () => this.config.headerHeight,
      getRowHeight: () => this.config.rowHeight,
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
    const { changed, viewportSizeChanged } = this.viewport.update(
      this.scrollTopOverride ?? scrollTop,
      scrollLeft,
      width,
      height,
    );
    if (!changed) return;

    this.rowData.requestVisibleRows();
    this.view.syncVisibleRows(viewportSizeChanged);
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

  private columnOperationDeps(): ColumnOperationDeps<TData> {
    return {
      columns: this.columns,
      computeColumnPositions: () => this.computeColumnPositions(),
      view: this.view,
    };
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
    const applied = applyColumnResize(
      colIndex,
      width,
      this.viewport.getViewportWidth(),
      this.columnOperationDeps(),
    );
    if (applied) this.config.onColumnResized?.(colIndex, width);
  }

  /**
   * Move a column from one index to another and recompute layout.
   */
  moveColumn(fromIndex: number, toIndex: number): void {
    const adjustedTo = applyColumnMove(fromIndex, toIndex, this.columnOperationDeps());
    if (adjustedTo !== null) this.config.onColumnMoved?.(fromIndex, adjustedTo);
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
    this.config.onRowDragEnd?.(sourceIndex, targetIndex);
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
    return this.columns;
  }

  getColumnPositions(): number[] {
    return [...this.columnPositions];
  }

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
   * Update columns and recompute layout.
   */
  setColumns(columns: ColumnDefinition[]): void {
    this.columns = columns;
    this.computeColumnPositions();
    this.view.reconcile();
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
