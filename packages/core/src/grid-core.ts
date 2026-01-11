// gp-grid-core/src/grid-core.ts

import type {
  GridCoreOptions,
  GridInstruction,
  InstructionListener,
  BatchInstructionListener,
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

  // Sort & Filter
  private sortModel: SortModel[] = [];
  private filterModel: FilterModel = {};
  private openFilterColIndex: number | null = null;

  // Managers
  public readonly selection: SelectionManager;
  public readonly fill: FillManager;
  public readonly input: InputHandler<TData>;
  private readonly slotPool: SlotPoolManager;
  private readonly editManager: EditManager;

  // Column positions (computed)
  private columnPositions: number[] = [];

  // Instruction listeners
  private listeners: InstructionListener[] = [];
  private batchListeners: BatchInstructionListener[] = [];

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
    this.selection.onInstruction((instruction) => this.emit(instruction));

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

    // Initialize input handler
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

  onInstruction(listener: InstructionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to batched instructions for efficient React state updates.
   * Batch listeners receive arrays of instructions instead of individual ones.
   */
  onBatchInstruction(listener: BatchInstructionListener): () => void {
    this.batchListeners.push(listener);
    return () => {
      this.batchListeners = this.batchListeners.filter((l) => l !== listener);
    };
  }

  private emit(instruction: GridInstruction): void {
    // console.log("[GP-Grid Core] emit:", instruction.type, { 
    //   listenerCount: this.listeners.length, 
    //   batchListenerCount: this.batchListeners.length 
    // });
    // Emit to individual listeners
    for (const listener of this.listeners) {
      listener(instruction);
    }
    // Also emit as a single-item batch
    for (const listener of this.batchListeners) {
      listener([instruction]);
    }
  }

  private emitBatch(instructions: GridInstruction[]): void {
    if (instructions.length === 0) return;
    
    // console.log("[GP-Grid Core] emitBatch:", instructions.map(i => i.type), {
    //   batchListenerCount: this.batchListeners.length
    // });
    // Emit to batch listeners as a single batch
    for (const listener of this.batchListeners) {
      listener(instructions);
    }
    // Also emit to individual listeners for backwards compatibility
    for (const instruction of instructions) {
      for (const listener of this.listeners) {
        listener(instruction);
      }
    }
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
      const request: DataSourceRequest = {
        pagination: {
          pageIndex: this.currentPageIndex,
          pageSize: this.pageSize,
        },
        sort: this.sortModel.length > 0 ? this.sortModel : undefined,
        filter: Object.keys(this.filterModel).length > 0 ? this.filterModel : undefined,
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

    for (let page = 1; page < totalPages; page++) {
      const request: DataSourceRequest = {
        pagination: {
          pageIndex: page,
          pageSize: this.pageSize,
        },
        sort: this.sortModel.length > 0 ? this.sortModel : undefined,
        filter: Object.keys(this.filterModel).length > 0 ? this.filterModel : undefined,
      };

      const response = await this.dataSource.fetch(request);
      response.rows.forEach((row, index) => {
        this.cachedRows.set(page * this.pageSize + index, row);
      });
    }
  }

  // ===========================================================================
  // Sort & Filter
  // ===========================================================================

  async setSort(
    colId: string,
    direction: SortDirection | null,
    addToExisting: boolean = false
  ): Promise<void> {
    // Check if sorting is enabled globally and for this column
    if (!this.sortingEnabled) return;

    const column = this.columns.find(c => (c.colId ?? c.field) === colId);
    if (column?.sortable === false) return;

    const existingIndex = this.sortModel.findIndex((s) => s.colId === colId);

    if (!addToExisting) {
      this.sortModel = direction === null ? [] : [{ colId, direction }];
    } else {
      if (direction === null) {
        if (existingIndex >= 0) {
          this.sortModel.splice(existingIndex, 1);
        }
      } else if (existingIndex >= 0) {
        this.sortModel[existingIndex]!.direction = direction;
      } else {
        this.sortModel.push({ colId, direction });
      }
    }

    // console.log("[GP-Grid Core] setSort - fetching sorted data...");
    await this.fetchData();
    // Refresh all slots with newly sorted data
    this.slotPool.refreshAllSlots();
    this.emitHeaders();
    // console.log("[GP-Grid Core] setSort - complete");
  }

  async setFilter(colId: string, filter: ColumnFilterModel | string | null): Promise<void> {
    const column = this.columns.find(c => (c.colId ?? c.field) === colId);
    if (column?.filterable === false) return;

    // Handle null, empty string, or empty conditions
    const isEmpty = filter === null ||
      (typeof filter === "string" && filter.trim() === "") ||
      (typeof filter === "object" && filter.conditions && filter.conditions.length === 0);

    if (isEmpty) {
      delete this.filterModel[colId];
    } else if (typeof filter === "string") {
      // Convert old string format to new ColumnFilterModel format
      this.filterModel[colId] = {
        conditions: [{ type: "text", operator: "contains", value: filter }],
        combination: "and",
      };
    } else {
      this.filterModel[colId] = filter;
    }

    await this.fetchData();
    // Force refresh all slots since filtered data changed
    this.slotPool.refreshAllSlots();
    this.emitContentSize();
    this.emitHeaders();
  }

  /**
   * Check if a column has an active filter
   */
  hasActiveFilter(colId: string): boolean {
    const filter = this.filterModel[colId];
    if (!filter) return false;
    return filter.conditions.length > 0;
  }

  /**
   * Check if a column is sortable
   */
  isColumnSortable(colIndex: number): boolean {
    if (!this.sortingEnabled) return false;
    const column = this.columns[colIndex];
    return column?.sortable !== false;
  }

  /**
   * Check if a column is filterable
   */
  isColumnFilterable(colIndex: number): boolean {
    const column = this.columns[colIndex];
    return column?.filterable !== false;
  }

  /**
   * Get distinct values for a column (for filter dropdowns)
   * For array-type columns (like tags), each unique array combination is returned.
   * Arrays are sorted internally for consistent comparison.
   * Limited to MAX_DISTINCT_VALUES to avoid performance issues with large datasets.
   */
  getDistinctValuesForColumn(colId: string, maxValues: number = 500): CellValue[] {
    // Find column once outside the loop
    const column = this.columns.find(c => (c.colId ?? c.field) === colId);
    if (!column) return [];

    // Use Map with stringified keys to handle deduplication of arrays
    const valuesMap = new Map<string, CellValue>();

    for (const row of this.cachedRows.values()) {
      const value = this.getFieldValue(row, column.field);

      if (Array.isArray(value)) {
        // Sort array items internally for consistent comparison (["vip", "new"] == ["new", "vip"])
        const sortedArray = [...value].sort((a, b) =>
          String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
        );
        const key = JSON.stringify(sortedArray);
        if (!valuesMap.has(key)) {
          valuesMap.set(key, sortedArray);
          // Stop early if we have too many distinct values
          if (valuesMap.size >= maxValues) break;
        }
      } else {
        const key = JSON.stringify(value);
        if (!valuesMap.has(key)) {
          valuesMap.set(key, value);
          // Stop early if we have too many distinct values
          if (valuesMap.size >= maxValues) break;
        }
      }
    }

    // Sort the results: arrays first (by string representation), then primitives
    const results = Array.from(valuesMap.values());
    results.sort((a, b) => {
      const strA = Array.isArray(a) ? a.join(', ') : String(a ?? '');
      const strB = Array.isArray(b) ? b.join(', ') : String(b ?? '');
      return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
    });

    return results;
  }

  /**
   * Open filter popup for a column (toggles if already open for same column)
   */
  openFilterPopup(colIndex: number, anchorRect: { top: number; left: number; width: number; height: number }): void {
    // If clicking on the same column's filter icon, close the popup
    if (this.openFilterColIndex === colIndex) {
      this.closeFilterPopup();
      return;
    }

    const column = this.columns[colIndex];
    if (!column || !this.isColumnFilterable(colIndex)) return;

    const colId = column.colId ?? column.field;
    const distinctValues = this.getDistinctValuesForColumn(colId);

    this.openFilterColIndex = colIndex;
    this.emit({
      type: "OPEN_FILTER_POPUP",
      colIndex,
      column,
      anchorRect,
      distinctValues,
      currentFilter: this.filterModel[colId],
    });
  }

  /**
   * Close filter popup
   */
  closeFilterPopup(): void {
    this.openFilterColIndex = null;
    this.emit({ type: "CLOSE_FILTER_POPUP" });
  }

  getSortModel(): SortModel[] {
    return [...this.sortModel];
  }

  getFilterModel(): FilterModel {
    return { ...this.filterModel };
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

    return this.getFieldValue(rowData, column.field);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    const rowData = this.cachedRows.get(row);
    if (!rowData || typeof rowData !== "object") return;

    const column = this.columns[col];
    if (!column) return;

    this.setFieldValue(rowData as Record<string, unknown>, column.field, value);
  }

  private getFieldValue(data: TData, field: string): CellValue {
    const parts = field.split(".");
    let value: unknown = data;

    for (const part of parts) {
      if (value == null || typeof value !== "object") {
        return null;
      }
      value = (value as Record<string, unknown>)[part];
    }

    return (value ?? null) as CellValue;
  }

  private setFieldValue(data: Record<string, unknown>, field: string, value: CellValue): void {
    const parts = field.split(".");
    let obj = data;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in obj)) {
        obj[part] = {};
      }
      obj = obj[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1]!;
    obj[lastPart] = value;
  }

  // ===========================================================================
  // Layout Helpers
  // ===========================================================================

  private computeColumnPositions(): void {
    this.columnPositions = [0];
    let pos = 0;
    for (const col of this.columns) {
      pos += col.width;
      this.columnPositions.push(pos);
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
    const sortInfoMap = new Map<string, { direction: SortDirection; index: number }>();
    this.sortModel.forEach((sort, index) => {
      sortInfoMap.set(sort.colId, { direction: sort.direction, index: index + 1 });
    });

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
        sortable: this.isColumnSortable(i),
        filterable: this.isColumnFilterable(i),
        hasFilter: this.hasActiveFilter(colId),
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

    // Clear cached row data (can be large for big datasets)
    this.cachedRows.clear();

    // Clear listeners
    this.listeners = [];
    this.batchListeners = [];

    // Reset state
    this.totalRows = 0;
    this.sortModel = [];
    this.filterModel = {};
  }
}

