// gp-grid-core/src/grid-core.ts

import type {
  GridCoreOptions,
  ColumnDefinition,
  CellValue,
  DataSource,
  DataSourceRequest,
  Row,
  SortModel,
  SortDirection,
  FilterModel,
  ColumnFilterModel,
  EditState,
} from "./types";
import { SelectionManager } from "./selection";
import { FillManager } from "./fill";
import { SlotPoolManager } from "./slot-pool";
import { EditManager } from "./edit-manager";
import { InputHandler } from "./input-handler";
import { HighlightManager } from "./highlight-manager";
import { SortFilterManager } from "./sort-filter-manager";
import { RowMutationManager } from "./row-mutation-manager";
import {
  createBatchInstructionEmitter,
  getFieldValue,
  setFieldValue,
} from "./utils";

// =============================================================================
// Constants
// =============================================================================

// Maximum safe scroll height across browsers (conservative value)
// Chrome/Edge: ~33.5M, Firefox: ~17.9M, Safari: ~33.5M
// We use 10M to be safe and leave room for other content
const MAX_SCROLL_HEIGHT = 10_000_000;

// =============================================================================
// GridCore
// =============================================================================

export class GridCore<TData extends Row = Row> {
  // Configuration
  private columns: ColumnDefinition[];
  private dataSource: DataSource<TData>;
  private rowHeight: number;
  private headerHeight: number;
  private overscan: number;
  private sortingEnabled: boolean;

  // Viewport state
  private scrollTop: number = 0;
  private scrollLeft: number = 0;
  private viewportWidth: number = 800;
  private viewportHeight: number = 600;

  // Data state
  private cachedRows: Map<number, TData> = new Map();
  private totalRows: number = 0;
  private currentPageIndex: number = 0;
  // Use large page size to avoid excessive pagination for client-side data sources
  private pageSize: number = 1000000;

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

  // Instruction emitter
  private emitter = createBatchInstructionEmitter();

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  onBatchInstruction = this.emitter.onBatchInstruction;
  private emit = this.emitter.emit;
  private emitBatch = this.emitter.emitBatch;

  // Scroll virtualization state
  private naturalContentHeight: number = 0;
  private virtualContentHeight: number = 0;
  private scrollRatio: number = 1;

  // Lifecycle state
  private isDestroyed: boolean = false;

  constructor(options: GridCoreOptions<TData>) {
    this.columns = options.columns;
    this.dataSource = options.dataSource;
    this.rowHeight = options.rowHeight;
    this.headerHeight = options.headerHeight ?? options.rowHeight;
    this.overscan = options.overscan ?? 3;
    this.sortingEnabled = options.sortingEnabled ?? true;

    this.computeColumnPositions();

    // Initialize selection manager
    this.selection = new SelectionManager({
      getRowCount: () => this.totalRows,
      getColumnCount: () => this.columns.length,
      getCellValue: (row, col) => this.getCellValue(row, col),
      getRowData: (row) => this.cachedRows.get(row),
      getColumn: (col) => this.columns[col],
    });

    // Forward selection instructions
    this.selection.onInstruction((instruction) => {
      this.emit(instruction);
      // Notify highlight manager of selection changes
      this.highlight?.onSelectionChange();
    });

    // Initialize highlight manager (only if highlighting options provided)
    if (options.highlighting) {
      this.highlight = new HighlightManager<TData>(
        {
          getActiveCell: () => this.selection.getActiveCell(),
          getSelectionRange: () => this.selection.getSelectionRange(),
          getColumn: (colIndex) => this.columns[colIndex],
        },
        options.highlighting,
      );

      // Forward highlight instructions
      this.highlight.onInstruction((instruction) => this.emit(instruction));
    } else {
      this.highlight = null;
    }

    // Initialize fill manager
    this.fill = new FillManager({
      getRowCount: () => this.totalRows,
      getColumnCount: () => this.columns.length,
      getCellValue: (row, col) => this.getCellValue(row, col),
      getColumn: (col) => this.columns[col],
      setCellValue: (row, col, value) => this.setCellValue(row, col, value),
    });

    // Forward fill instructions
    this.fill.onInstruction((instruction) => this.emit(instruction));

    // Initialize slot pool manager
    this.slotPool = new SlotPoolManager({
      getRowHeight: () => this.rowHeight,
      getHeaderHeight: () => this.headerHeight,
      getOverscan: () => this.overscan,
      getScrollTop: () => this.scrollTop,
      getViewportHeight: () => this.viewportHeight,
      getTotalRows: () => this.totalRows,
      getScrollRatio: () => this.scrollRatio,
      getVirtualContentHeight: () => this.virtualContentHeight,
      getRowData: (rowIndex) => this.cachedRows.get(rowIndex),
    });

    // Forward slot pool instructions (use batch listener for performance)
    this.slotPool.onBatchInstruction((instructions) => this.emitBatch(instructions));

    // Initialize edit manager
    this.editManager = new EditManager({
      getColumn: (col) => this.columns[col],
      getCellValue: (row, col) => this.getCellValue(row, col),
      setCellValue: (row, col, value) => this.setCellValue(row, col, value),
      onCommit: (row) => {
        // Update the slot displaying this row after edit commit
        this.slotPool.updateSlot(row);
      },
    });

    // Forward edit manager instructions
    this.editManager.onInstruction((instruction) => this.emit(instruction));

    // Initialize sort/filter manager
    this.sortFilter = new SortFilterManager<TData>({
      getColumns: () => this.columns,
      isSortingEnabled: () => this.sortingEnabled,
      getCachedRows: () => this.cachedRows,
      onSortFilterChange: async () => {
        await this.fetchData();
        this.highlight?.clearAllCaches();
        this.slotPool.refreshAllSlots();
      },
      onDataRefreshed: () => {
        this.emitContentSize();
        this.emitHeaders();
      },
    });

    // Forward sort/filter instructions
    this.sortFilter.onInstruction((instruction) => this.emit(instruction));

    // Initialize row mutation manager
    this.rowMutation = new RowMutationManager<TData>({
      getCachedRows: () => this.cachedRows,
      setCachedRows: (rows) => { this.cachedRows = rows; },
      getTotalRows: () => this.totalRows,
      setTotalRows: (count) => { this.totalRows = count; },
      updateSlot: (rowIndex) => this.slotPool.updateSlot(rowIndex),
      refreshAllSlots: () => this.slotPool.refreshAllSlots(),
      emitContentSize: () => this.emitContentSize(),
      clearSelectionIfInvalid: (maxValidRow) => {
        const activeCell = this.selection.getActiveCell();
        if (activeCell && activeCell.row >= maxValidRow) {
          this.selection.clearSelection();
        }
      },
    });

    // Forward row mutation instructions
    this.rowMutation.onInstruction((instruction) => this.emit(instruction));

    // Initialize input handler
    this.input = new InputHandler(this, {
      getHeaderHeight: () => this.headerHeight,
      getRowHeight: () => this.rowHeight,
      getColumnPositions: () => this.columnPositions,
      getColumnCount: () => this.columns.length,
    });
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
    height: number
  ): void {
    // When scroll ratio < 1, map the visual scroll position to actual content position
    // scrollTop is the browser's reported scroll position within the virtual container
    // We need to convert this to determine which row should be at the top of the viewport
    const effectiveScrollTop = this.scrollRatio < 1
      ? scrollTop / this.scrollRatio
      : scrollTop;

    const viewportSizeChanged =
      this.viewportWidth !== width ||
      this.viewportHeight !== height;

    const changed =
      this.scrollTop !== effectiveScrollTop ||
      this.scrollLeft !== scrollLeft ||
      viewportSizeChanged;

    if (!changed) return;

    this.scrollTop = effectiveScrollTop;
    this.scrollLeft = scrollLeft;
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.slotPool.syncSlots();

    // Emit visible range update so React (or other frameworks) can track it
    const visibleRange = this.getVisibleRowRange();
    this.emit({
      type: "UPDATE_VISIBLE_RANGE",
      start: visibleRange.start,
      end: visibleRange.end,
    });

    // Emit content size when viewport size changes (for column scaling)
    if (viewportSizeChanged) {
      this.emitContentSize();
    }
  }

  // ===========================================================================
  // Data Fetching
  // ===========================================================================

  private async fetchData(): Promise<void> {
    this.emit({ type: "DATA_LOADING" });

    try {
      const sortModel = this.sortFilter.getSortModel();
      const filterModel = this.sortFilter.getFilterModel();

      const request: DataSourceRequest = {
        pagination: {
          pageIndex: this.currentPageIndex,
          pageSize: this.pageSize,
        },
        sort: sortModel.length > 0 ? sortModel : undefined,
        filter: Object.keys(filterModel).length > 0 ? filterModel : undefined,
      };

      const response = await this.dataSource.fetch(request);

      // Cache the fetched rows
      this.cachedRows.clear();
      response.rows.forEach((row, index) => {
        this.cachedRows.set(this.currentPageIndex * this.pageSize + index, row);
      });

      this.totalRows = response.totalRows;

      // For client-side data source, fetch all data for simplicity
      // (the client data source handles filtering/sorting internally)
      if (response.totalRows > response.rows.length && this.currentPageIndex === 0) {
        // Fetch all remaining pages for client-side mode
        await this.fetchAllData();
      }

      this.emit({ type: "DATA_LOADED", totalRows: this.totalRows });
    } catch (error) {
      this.emit({
        type: "DATA_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async fetchAllData(): Promise<void> {
    // Fetch all data in chunks for client-side data source
    const totalPages = Math.ceil(this.totalRows / this.pageSize);
    const sortModel = this.sortFilter.getSortModel();
    const filterModel = this.sortFilter.getFilterModel();

    for (let page = 1; page < totalPages; page++) {
      const request: DataSourceRequest = {
        pagination: {
          pageIndex: page,
          pageSize: this.pageSize,
        },
        sort: sortModel.length > 0 ? sortModel : undefined,
        filter: Object.keys(filterModel).length > 0 ? filterModel : undefined,
      };

      const response = await this.dataSource.fetch(request);
      response.rows.forEach((row, index) => {
        this.cachedRows.set(page * this.pageSize + index, row);
      });
    }
  }

  // ===========================================================================
  // Sort & Filter (delegates to SortFilterManager)
  // ===========================================================================

  async setSort(
    colId: string,
    direction: SortDirection | null,
    addToExisting: boolean = false
  ): Promise<void> {
    return this.sortFilter.setSort(colId, direction, addToExisting);
  }

  async setFilter(colId: string, filter: ColumnFilterModel | string | null): Promise<void> {
    return this.sortFilter.setFilter(colId, filter);
  }

  hasActiveFilter(colId: string): boolean {
    return this.sortFilter.hasActiveFilter(colId);
  }

  isColumnSortable(colIndex: number): boolean {
    return this.sortFilter.isColumnSortable(colIndex);
  }

  isColumnFilterable(colIndex: number): boolean {
    return this.sortFilter.isColumnFilterable(colIndex);
  }

  getDistinctValuesForColumn(colId: string, maxValues: number = 500): CellValue[] {
    return this.sortFilter.getDistinctValuesForColumn(colId, maxValues);
  }

  openFilterPopup(colIndex: number, anchorRect: { top: number; left: number; width: number; height: number }): void {
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
    const rowData = this.cachedRows.get(row);
    if (!rowData) return null;

    const column = this.columns[col];
    if (!column) return null;

    return getFieldValue(rowData, column.field);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    const rowData = this.cachedRows.get(row);
    if (!rowData || typeof rowData !== "object") return;

    const column = this.columns[col];
    if (!column) return;

    setFieldValue(rowData as Record<string, unknown>, column.field, value);
  }

  // ===========================================================================
  // Layout Helpers
  // ===========================================================================

  private computeColumnPositions(): void {
    this.columnPositions = [0];
    let pos = 0;
    for (const col of this.columns) {
      // Only include visible columns in content width calculation
      if (!col.hidden) {
        pos += col.width;
        this.columnPositions.push(pos);
      }
    }
  }

  private emitContentSize(): void {
    const width = this.columnPositions[this.columnPositions.length - 1] ?? 0;
    
    // Calculate natural (real) content height
    this.naturalContentHeight = this.totalRows * this.rowHeight + this.headerHeight;
    
    // Apply scroll virtualization if content exceeds browser limits
    if (this.naturalContentHeight > MAX_SCROLL_HEIGHT) {
      this.virtualContentHeight = MAX_SCROLL_HEIGHT;
      this.scrollRatio = MAX_SCROLL_HEIGHT / this.naturalContentHeight;
    } else {
      this.virtualContentHeight = this.naturalContentHeight;
      this.scrollRatio = 1;
    }
    
    this.emit({
      type: "SET_CONTENT_SIZE",
      width,
      height: this.virtualContentHeight,
      viewportWidth: this.viewportWidth,
    });
  }

  private emitHeaders(): void {
    const sortInfoMap = this.sortFilter.getSortInfoMap();

    for (let i = 0; i < this.columns.length; i++) {
      const column = this.columns[i]!;
      const colId = column.colId ?? column.field;
      const sortInfo = sortInfoMap.get(colId);

      this.emit({
        type: "UPDATE_HEADER",
        colIndex: i,
        column,
        sortDirection: sortInfo?.direction,
        sortIndex: sortInfo?.index,
        sortable: this.sortFilter.isColumnSortable(i),
        filterable: this.sortFilter.isColumnFilterable(i),
        hasFilter: this.sortFilter.hasActiveFilter(colId),
      });
    }
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
    return this.totalRows;
  }

  getRowHeight(): number {
    return this.rowHeight;
  }

  getHeaderHeight(): number {
    return this.headerHeight;
  }

  getTotalWidth(): number {
    return this.columnPositions[this.columnPositions.length - 1] ?? 0;
  }

  getTotalHeight(): number {
    // Return the virtual (capped) height for external use
    return this.virtualContentHeight || (this.totalRows * this.rowHeight + this.headerHeight);
  }

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
    return this.naturalContentHeight || (this.totalRows * this.rowHeight + this.headerHeight);
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
    // viewportHeight includes header, so subtract it to get content area
    const contentHeight = this.viewportHeight - this.headerHeight;
    const firstVisibleRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight));
    // Use ceil and subtract 1 to include any partially visible row at the bottom
    const lastVisibleRow = Math.min(
      this.totalRows - 1,
      Math.ceil((this.scrollTop + contentHeight) / this.rowHeight) - 1
    );
    return { start: firstVisibleRow, end: Math.max(firstVisibleRow, lastVisibleRow) };
  }

  /**
   * Get the scroll position needed to bring a row into view.
   * Accounts for scroll scaling when active.
   */
  getScrollTopForRow(rowIndex: number): number {
    const naturalScrollTop = rowIndex * this.rowHeight;
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
    // Convert virtual scroll position to natural position
    const naturalScrollTop = this.scrollRatio < 1
      ? virtualScrollTop / this.scrollRatio
      : virtualScrollTop;

    // Natural Y = viewport offset + natural scroll position
    const naturalY = viewportY + naturalScrollTop;
    return Math.floor(naturalY / this.rowHeight);
  }

  getRowData(rowIndex: number): TData | undefined {
    return this.cachedRows.get(rowIndex);
  }

  // ===========================================================================
  // Data Updates
  // ===========================================================================

  /**
   * Refresh data from the data source.
   */
  async refresh(): Promise<void> {
    await this.fetchData();
    // Clear highlight caches since row data may have changed
    this.highlight?.clearAllCaches();
    // Use refreshAllSlots instead of syncSlots to ensure all slot data is updated
    // This is important when data changes (e.g., rows added) but visible indices stay the same
    this.slotPool.refreshAllSlots();
    this.emitContentSize();

    // Emit visible range since totalRows may have changed
    const visibleRange = this.getVisibleRowRange();
    this.emit({
      type: "UPDATE_VISIBLE_RANGE",
      start: visibleRange.start,
      end: visibleRange.end,
    });
  }

  /**
   * Refresh slot display without refetching data.
   * Useful after in-place data modifications like fill operations.
   */
  refreshSlotData(): void {
    this.slotPool.refreshAllSlots();
  }

  // ===========================================================================
  // Row Mutation API (delegates to RowMutationManager)
  // ===========================================================================

  /**
   * Add rows to the grid at the specified index.
   * If no index is provided, rows are added at the end.
   */
  addRows(rows: TData[], index?: number): void {
    this.rowMutation.addRows(rows, index);
  }

  /**
   * Update existing rows with partial data.
   */
  updateRows(updates: Array<{ index: number; data: Partial<TData> }>): void {
    this.rowMutation.updateRows(updates);
  }

  /**
   * Delete rows at the specified indices.
   */
  deleteRows(indices: number[]): void {
    this.rowMutation.deleteRows(indices);
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
  }

  /**
   * Update the data source and refresh.
   */
  async setDataSource(dataSource: DataSource<TData>): Promise<void> {
    this.dataSource = dataSource;
    await this.refresh();
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
    this.rowMutation.destroy();

    // Clear cached row data (can be large for big datasets)
    this.cachedRows.clear();

    // Clear listeners
    this.emitter.clearListeners();

    // Reset state
    this.totalRows = 0;
  }
}

