// @gp-grid/core/src/grid-core.ts

import type {
  GridCoreOptions,
  BatchInstructionListener,
  ColumnDefinition,
  CellValue,
  CellValueChangedEvent,
  DataSource,
  ColumnLayout,
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
import { RowGroupingManager } from "./row-grouping";
import type { PresentationRow } from "./row-grouping";
import type {
  HighlightManager,
  RowMutationManager,
  ScrollVirtualizationManager,
  SortFilterManager,
  ViewportState,
} from "./managers";
import { InstructionBatcher } from "./managers";
import {
  buildDataSourceRequest,
  computeColumnLayout,
  computeColumnPositions,
  readCell,
  writeCell,
} from "./utils";
import { buildGridManagers } from "./grid-core-managers";
import {
  emitContentSize as emitContentSizeFn,
  emitHeaders as emitHeadersFn,
  emitVisibleRange as emitVisibleRangeFn,
} from "./grid-core-emitters";
import {
  applyColumnMove,
  applyColumnResize,
  applyRowDragCommit,
  refreshTransactionData,
} from "./grid-core-operations";

// =============================================================================
// GridCore
// =============================================================================

export class GridCore<TData = unknown> {
  // Configuration
  private columns: ColumnDefinition[];
  private dataSource: DataSource<TData>;
  private readonly rowHeight: number;
  private readonly headerHeight: number;
  private readonly overscan: number;
  private readonly sortingEnabled: boolean;
  private readonly getRowId?: (row: TData) => RowId;
  private readonly onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  private readonly rowDragEntireRow: boolean;
  private readonly onRowDragEnd?: (sourceIndex: number, targetIndex: number) => void;
  private readonly onColumnResized?: (colIndex: number, newWidth: number) => void;
  private readonly onColumnMoved?: (fromIndex: number, toIndex: number) => void;
  private readonly onRowGroupExpandedChange?: (groupKey: string, expanded: boolean) => void;

  // Viewport state
  private readonly viewport: ViewportState;

  // Data state
  private readonly currentPageIndex: number = 0;
  // Fetch all rows in a single page for client-side data sources
  private readonly pageSize: number = Number.MAX_SAFE_INTEGER;
  private cachedRows: Map<number, TData> = new Map();
  private totalRows: number = 0;
  private readonly rowGrouping: RowGroupingManager<TData>;

  // Managers
  public readonly selection: SelectionManager;
  public readonly fill: FillManager;
  public readonly input: InputHandler<TData>;
  public readonly highlight: HighlightManager<TData> | null;
  public readonly sortFilter: SortFilterManager<TData>;
  public readonly rowMutation: RowMutationManager<TData>;
  private readonly slotPool: SlotPoolManager;
  private readonly editManager: EditManager;

  // Column positions (computed)
  private columnPositions: number[] = [];
  private columnLayout: ColumnLayout;

  // Instruction dispatch
  private readonly batcher = new InstructionBatcher();

  // Scroll virtualization
  private readonly scrollVirtualization: ScrollVirtualizationManager;

  // Lifecycle state
  private isDestroyed: boolean = false;

  // Loading state (guards against concurrent sort/filter operations)
  private _isDataLoading: boolean = false;

  constructor(options: GridCoreOptions<TData>) {
    this.columns = options.columns;
    this.dataSource = options.dataSource;
    this.rowHeight = options.rowHeight;
    this.headerHeight = options.headerHeight ?? options.rowHeight;
    this.overscan = options.overscan ?? 3;
    this.sortingEnabled = options.sortingEnabled ?? true;
    this.getRowId = options.getRowId;
    this.onCellValueChanged = options.onCellValueChanged;
    this.rowDragEntireRow = options.rowDragEntireRow ?? false;
    this.onRowDragEnd = options.onRowDragEnd;
    this.onColumnResized = options.onColumnResized;
    this.onColumnMoved = options.onColumnMoved;
    this.onRowGroupExpandedChange = options.onRowGroupExpandedChange;
    if (this.onCellValueChanged && !this.getRowId) {
      throw new Error("getRowId is required when onCellValueChanged is provided");
    }

    this.columnLayout = computeColumnLayout(this.columns);
    this.computeColumnPositions();
    this.rowGrouping = new RowGroupingManager<TData>({
      getColumns: () => this.columns,
      getCachedRows: () => this.cachedRows,
      getTotalRows: () => this.totalRows,
      onExpandedChange: (groupKey, expanded) => {
        this.onRowGroupExpandedChange?.(groupKey, expanded);
      },
    }, options.rowGrouping);

    const managers = buildGridManagers<TData>({
      batcher: this.batcher,
      highlighting: options.highlighting,
      getColumns: () => this.columns,
      getCachedRows: () => this.cachedRows,
      setCachedRows: (rows) => { this.cachedRows = rows; },
      getTotalRows: () => this.getPresentationRowCount(),
      setTotalRows: (count) => { this.totalRows = count; },
      getPresentationRow: (rowIndex) => this.getPresentationRow(rowIndex),
      getRowHeight: () => this.rowHeight,
      getHeaderHeight: () => this.headerHeight,
      getOverscan: () => this.overscan,
      getSortingEnabled: () => this.sortingEnabled,
      getCellValue: (row, col) => this.getCellValue(row, col),
      setCellValue: (row, col, value) => this.setCellValue(row, col, value),
      emitContentSize: () => this.emitContentSize(),
      emitHeaders: () => this.emitHeaders(),
      fetchData: () => this.fetchData(),
      clearSelectionIfInvalid: (maxValidRow) => this.clearSelectionIfInvalid(maxValidRow),
    });
    this.selection = managers.selection;
    this.highlight = managers.highlight;
    this.fill = managers.fill;
    this.scrollVirtualization = managers.scrollVirtualization;
    this.viewport = managers.viewport;
    this.slotPool = managers.slotPool;
    this.editManager = managers.editManager;
    this.sortFilter = managers.sortFilter;
    this.rowMutation = managers.rowMutation;

    this.input = new InputHandler(this, {
      getHeaderHeight: () => this.headerHeight,
      getRowHeight: () => this.rowHeight,
      getColumnPositions: () => this.columnPositions,
      getColumnLayout: () => this.columnLayout,
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
    await this.fetchData();
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
    const { changed, verticalChanged, viewportSizeChanged } = this.viewport.update(
      scrollTop,
      scrollLeft,
      width,
      height,
    );
    if (!changed) return;

    if (verticalChanged || viewportSizeChanged) {
      this.slotPool.syncSlots();
      this.emitVisibleRange();
    }
    if (viewportSizeChanged) this.emitContentSize();
  }

  // ===========================================================================
  // Data Fetching
  // ===========================================================================

  private async fetchData(): Promise<void> {
    this._isDataLoading = true;
    this.batcher.emit({ type: "DATA_LOADING" });

    try {
      const request = buildDataSourceRequest({
        pageIndex: this.currentPageIndex,
        pageSize: this.pageSize,
        sortModel: this.sortFilter.getSortModel(),
        filterModel: this.sortFilter.getFilterModel(),
        columns: this.columns,
      });

      const response = await this.dataSource.fetch(request);

      // Cache the fetched rows
      this.cachedRows.clear();
      const startIndex = this.currentPageIndex * this.pageSize;
      response.rows.forEach((row, i) => {
        this.cachedRows.set(startIndex + i, row);
      });
      this.totalRows = response.totalRows;
      this.rowGrouping.rebuild();

      this.batcher.emit({
        type: "DATA_LOADED",
        totalRows: this.getPresentationRowCount(),
      });
    } catch (error) {
      this.batcher.emit({
        type: "DATA_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this._isDataLoading = false;
    }
  }

  // ===========================================================================
  // Sort & Filter (facade methods delegating to SortFilterManager)
  // ===========================================================================

  async setSort(
    colId: string,
    direction: SortDirection | null,
    addToExisting: boolean = false,
  ): Promise<void> {
    if (this._isDataLoading) return;
    return this.sortFilter.setSort(colId, direction, addToExisting);
  }

  async setFilter(colId: string, filter: ColumnFilterModel | string | null): Promise<void> {
    if (this._isDataLoading) return;
    return this.sortFilter.setFilter(colId, filter);
  }

  hasActiveFilter(colId: string): boolean {
    return this.sortFilter.hasActiveFilter(colId);
  }

  getDistinctValuesForColumn(
    colId: string,
    maxValues: number = 500,
  ): CellValue[] {
    return this.sortFilter.getDistinctValuesForColumn(colId, maxValues);
  }

  openFilterPopup(colIndex: number, anchorRect: { top: number; left: number; width: number; height: number }): void {
    if (this._isDataLoading) return;
    this.sortFilter.openFilterPopup(colIndex, anchorRect);
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

  updateEditValue(value: CellValue): void {
    this.editManager.updateValue(value);
  }

  commitEdit(): void {
    this.editManager.commit();
  }

  cancelEdit(): void {
    this.editManager.cancel();
  }

  getEditState(): EditState | null {
    return this.editManager.getState();
  }

  // ===========================================================================
  // Cell Value Access
  // ===========================================================================

  getCellValue(row: number, col: number): CellValue {
    return readCell(this.cachedRows, this.columns, this.getSourceRowIndex(row), col);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    writeCell(this.cachedRows, this.columns, this.getSourceRowIndex(row), col, value, {
      onCellValueChanged: this.onCellValueChanged,
      getRowId: this.getRowId,
    });
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
    this.columnLayout = computeColumnLayout(this.columns);
  }

  private emitContentSize(): void {
    emitContentSizeFn({
      batcher: this.batcher,
      scrollVirtualization: this.scrollVirtualization,
      slotPool: this.slotPool,
      viewport: this.viewport,
      columnPositions: this.columnPositions,
    });
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
   * Set the width of a column and recompute layout.
   */
  setColumnWidth(colIndex: number, width: number): void {
    applyColumnResize(colIndex, width, {
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
      onComplete: () => {},
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
      dataSource: this.dataSource,
      cachedRows: this.cachedRows,
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

  getColumnLayout(): ColumnLayout {
    return this.columnLayout;
  }

  getRowCount(): number {
    return this.getPresentationRowCount();
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

  getNaturalHeight(): number {
    return this.scrollVirtualization.getNaturalHeight();
  }

  getScrollRatio(): number {
    return this.scrollVirtualization.getScrollRatio();
  }

  getVisibleRowRange(): { start: number; end: number } {
    return this.scrollVirtualization.getVisibleRowRange();
  }

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
    const row = this.getPresentationRow(rowIndex);
    if (row?.kind === "data") return row.rowData;
    return this.cachedRows.get(rowIndex);
  }

  getPresentationRow(rowIndex: number): PresentationRow<TData> | undefined {
    return this.rowGrouping.getRow(rowIndex);
  }

  toggleRowGroup(groupKey: string): void {
    this.rowGrouping.toggle(groupKey);
    this.batcher.emit({
      type: "DATA_LOADED",
      totalRows: this.getPresentationRowCount(),
    });
    this.emitContentSize();
    this.slotPool.syncSlots();
    this.emitVisibleRange();
  }

  private getPresentationRowCount(): number {
    return this.rowGrouping.getRowCount();
  }

  private getSourceRowIndex(rowIndex: number): number {
    const row = this.getPresentationRow(rowIndex);
    if (row?.kind === "data") return row.rowIndex;
    return rowIndex;
  }

  private refreshPresentationRows(): void {
    this.rowGrouping.rebuild();
    this.batcher.emit({
      type: "DATA_LOADED",
      totalRows: this.getPresentationRowCount(),
    });
    this.slotPool.syncSlots();
    this.emitContentSize();
    this.emitVisibleRange();
  }

  // ===========================================================================
  // Data Updates
  // ===========================================================================

  /**
   * Refresh data from the data source.
   */
  async refresh(): Promise<void> {
    await this.fetchData();
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
    await refreshTransactionData({
      dataSource: this.dataSource,
      sortFilter: this.sortFilter,
      cachedRows: this.cachedRows,
      setTotalRows: (n) => { this.totalRows = n; },
      getColumns: () => this.columns,
    });
    this.rowGrouping.rebuild();
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

  // ===========================================================================
  // Row Mutation API (facade methods delegating to RowMutationManager)
  // ===========================================================================

  /**
   * Add rows to the grid at the specified index.
   * If no index is provided, rows are added at the end.
   */
  addRows(rows: TData[], index?: number): void {
    this.rowMutation.addRows(rows, index);
    this.refreshPresentationRows();
  }

  /**
   * Update existing rows with partial data.
   */
  updateRows(updates: Array<{ index: number; data: Partial<TData> }>): void {
    this.rowMutation.updateRows(updates);
    this.refreshPresentationRows();
  }

  /**
   * Delete rows at the specified indices.
   */
  deleteRows(indices: number[]): void {
    this.rowMutation.deleteRows(indices);
    this.refreshPresentationRows();
  }

  /**
   * Get a row by index.
   */
  getRow(index: number): TData | undefined {
    return this.rowMutation.getRow(index);
  }

  /**
   * Set a complete row at the specified index.
   * Use this for complete row replacement. For partial updates, use updateRows.
   */
  setRow(index: number, data: TData): void {
    this.rowMutation.setRow(index, data);
    this.refreshPresentationRows();
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
    this.dataSource = dataSource;
    await this.refresh();
    this.clearSelectionIfInvalid(this.getPresentationRowCount());
  }

  /**
   * Update columns and recompute layout.
   */
  setColumns(columns: ColumnDefinition[]): void {
    this.columns = columns;
    this.computeColumnPositions();
    this.rowGrouping.rebuild();
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
    this.rowMutation.destroy();

    // Clear cached row data (can be large for big datasets)
    this.cachedRows.clear();

    // Clear listeners
    this.batcher.clearListeners();

    // Reset state
    this.totalRows = 0;
  }
}
