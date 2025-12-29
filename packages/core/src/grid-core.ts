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
  SlotState,
  EditState,
} from "./types";
import { SelectionManager } from "./selection";
import { FillManager } from "./fill";

// =============================================================================
// Constants
// =============================================================================

// Maximum safe scroll height across browsers (conservative value)
// Chrome/Edge: ~33.5M, Firefox: ~17.9M, Safari: ~33.5M
// We use 10M to be safe and leave room for other content
const MAX_SCROLL_HEIGHT = 10_000_000;

// =============================================================================
// Slot Pool Manager
// =============================================================================

interface SlotPoolState {
  slots: Map<string, SlotState>;
  /** Maps rowIndex to slotId for quick lookup */
  rowToSlot: Map<number, string>;
  nextSlotId: number;
}

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

  // Slot pool
  private slotPool: SlotPoolState = {
    slots: new Map(),
    rowToSlot: new Map(),
    nextSlotId: 0,
  };

  // Managers
  public readonly selection: SelectionManager;
  public readonly fill: FillManager;

  // Edit state
  private editState: EditState | null = null;

  // Column positions (computed)
  private columnPositions: number[] = [];

  // Instruction listeners
  private listeners: InstructionListener[] = [];
  private batchListeners: BatchInstructionListener[] = [];

  // Scroll virtualization state
  private naturalContentHeight: number = 0;
  private virtualContentHeight: number = 0;
  private scrollRatio: number = 1;

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
    this.syncSlots();
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

    const changed =
      this.scrollTop !== effectiveScrollTop ||
      this.scrollLeft !== scrollLeft ||
      this.viewportWidth !== width ||
      this.viewportHeight !== height;

    if (!changed) return;

    this.scrollTop = effectiveScrollTop;
    this.scrollLeft = scrollLeft;
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.syncSlots();
  }

  // ===========================================================================
  // Slot Pool Management (Virtual Scroll)
  // ===========================================================================

  /**
   * Synchronize slots with current viewport position.
   * This implements the slot recycling strategy.
   */
  private syncSlots(): void {
    const visibleStartRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - this.overscan);
    const visibleEndRow = Math.min(
      this.totalRows - 1,
      Math.ceil((this.scrollTop + this.viewportHeight) / this.rowHeight) + this.overscan
    );

    if (this.totalRows === 0 || visibleEndRow < visibleStartRow) {
      // No rows to display - destroy all slots
      this.destroyAllSlots();
      return;
    }

    const requiredRows = new Set<number>();
    for (let row = visibleStartRow; row <= visibleEndRow; row++) {
      requiredRows.add(row);
    }

    const instructions: GridInstruction[] = [];

    // Find slots that are no longer needed
    const slotsToRecycle: string[] = [];
    for (const [slotId, slot] of this.slotPool.slots) {
      if (!requiredRows.has(slot.rowIndex)) {
        slotsToRecycle.push(slotId);
        this.slotPool.rowToSlot.delete(slot.rowIndex);
      } else {
        requiredRows.delete(slot.rowIndex);
      }
    }

    // Assign recycled slots to new rows
    const rowsNeedingSlots = Array.from(requiredRows);
    for (let i = 0; i < rowsNeedingSlots.length; i++) {
      const rowIndex = rowsNeedingSlots[i]!;
      const rowData = this.cachedRows.get(rowIndex);

      if (i < slotsToRecycle.length) {
        // Recycle existing slot
        const slotId = slotsToRecycle[i]!;
        const slot = this.slotPool.slots.get(slotId)!;
        const translateY = this.getRowTranslateY(rowIndex);

        slot.rowIndex = rowIndex;
        slot.rowData = rowData ?? {};
        slot.translateY = translateY;

        this.slotPool.rowToSlot.set(rowIndex, slotId);

        instructions.push({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex,
          rowData: rowData ?? {},
        });
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY,
        });
      } else {
        // Create new slot
        const slotId = `slot-${this.slotPool.nextSlotId++}`;
        const translateY = this.getRowTranslateY(rowIndex);

        const newSlot: SlotState = {
          slotId,
          rowIndex,
          rowData: rowData ?? {},
          translateY,
        };

        this.slotPool.slots.set(slotId, newSlot);
        this.slotPool.rowToSlot.set(rowIndex, slotId);

        instructions.push({ type: "CREATE_SLOT", slotId });
        instructions.push({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex,
          rowData: rowData ?? {},
        });
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY,
        });
      }
    }

    // Destroy excess slots
    for (let i = rowsNeedingSlots.length; i < slotsToRecycle.length; i++) {
      const slotId = slotsToRecycle[i]!;
      this.slotPool.slots.delete(slotId);
      instructions.push({ type: "DESTROY_SLOT", slotId });
    }

    // Update positions of existing slots that haven't moved
    for (const [slotId, slot] of this.slotPool.slots) {
      const expectedY = this.getRowTranslateY(slot.rowIndex);
      if (slot.translateY !== expectedY) {
        slot.translateY = expectedY;
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY: expectedY,
        });
      }
    }

    this.emitBatch(instructions);
  }

  private destroyAllSlots(): void {
    const instructions: GridInstruction[] = [];
    for (const slotId of this.slotPool.slots.keys()) {
      instructions.push({ type: "DESTROY_SLOT", slotId });
    }
    this.slotPool.slots.clear();
    this.slotPool.rowToSlot.clear();
    this.emitBatch(instructions);
  }

  private getRowTranslateY(rowIndex: number): number {
    // Calculate the natural position for this row
    const naturalY = rowIndex * this.rowHeight + this.headerHeight;
    
    if (this.scrollRatio >= 1) {
      return naturalY;
    }
    
    // With scroll virtualization, we need to position rows relative to the viewport
    // so they appear at the correct location within the capped container height.
    //
    // naturalScrollTop is where we are in "real" content space (already mapped from virtual)
    // virtualScrollTop is where the browser thinks we are in the DOM
    // offset = the difference we need to subtract to keep rows within bounds
    const naturalScrollTop = this.scrollTop;
    const virtualScrollTop = naturalScrollTop * this.scrollRatio;
    const offset = naturalScrollTop - virtualScrollTop;
    
    // Position row at its natural Y minus the offset
    // This keeps rows properly spaced and within virtual container bounds
    return naturalY - offset;
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
    this.refreshAllSlots();
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
    this.refreshAllSlots();
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
   */
  getDistinctValuesForColumn(colId: string): CellValue[] {
    // Use Map with stringified keys to handle deduplication of arrays
    const valuesMap = new Map<string, CellValue>();

    for (const row of this.cachedRows.values()) {
      const column = this.columns.find(c => (c.colId ?? c.field) === colId);
      if (column) {
        const value = this.getFieldValue(row, column.field);

        if (Array.isArray(value)) {
          // Sort array items internally for consistent comparison (["vip", "new"] == ["new", "vip"])
          const sortedArray = [...value].sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
          );
          const key = JSON.stringify(sortedArray);
          if (!valuesMap.has(key)) {
            valuesMap.set(key, sortedArray);
          }
        } else {
          const key = JSON.stringify(value);
          if (!valuesMap.has(key)) {
            valuesMap.set(key, value);
          }
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
   * Open filter popup for a column
   */
  openFilterPopup(colIndex: number, anchorRect: { top: number; left: number; width: number; height: number }): void {
    const column = this.columns[colIndex];
    if (!column || !this.isColumnFilterable(colIndex)) return;

    const colId = column.colId ?? column.field;
    const distinctValues = this.getDistinctValuesForColumn(colId);

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
    this.emit({ type: "CLOSE_FILTER_POPUP" });
  }

  /**
   * Force refresh all slot data (used after filtering/sorting when data changes)
   */
  private refreshAllSlots(): void {
    const instructions: GridInstruction[] = [];

    for (const [slotId, slot] of this.slotPool.slots) {
      // Check if row index is still valid
      if (slot.rowIndex >= 0 && slot.rowIndex < this.totalRows) {
        const rowData = this.cachedRows.get(slot.rowIndex);
        const translateY = this.getRowTranslateY(slot.rowIndex);

        slot.rowData = rowData ?? {};
        slot.translateY = translateY;

        instructions.push({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex: slot.rowIndex,
          rowData: rowData ?? {},
        });
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY,
        });
      }
    }

    this.emitBatch(instructions);

    // Also sync slots to handle any rows that went out of bounds
    this.syncSlots();
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
    const column = this.columns[col];
    if (!column || column.editable !== true) return;

    const initialValue = this.getCellValue(row, col);
    this.editState = {
      row,
      col,
      initialValue,
      currentValue: initialValue,
    };

    this.emit({
      type: "START_EDIT",
      row,
      col,
      initialValue,
    });
  }

  updateEditValue(value: CellValue): void {
    if (this.editState) {
      this.editState.currentValue = value;
    }
  }

  commitEdit(): void {
    if (!this.editState) return;

    const { row, col, currentValue } = this.editState;
    this.setCellValue(row, col, currentValue);

    this.emit({
      type: "COMMIT_EDIT",
      row,
      col,
      value: currentValue,
    });

    this.editState = null;
    this.emit({ type: "STOP_EDIT" });

    // Update the slot displaying this row
    const slotId = this.slotPool.rowToSlot.get(row);
    if (slotId) {
      const rowData = this.cachedRows.get(row);
      if (rowData) {
        this.emit({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex: row,
          rowData,
        });
      }
    }
  }

  cancelEdit(): void {
    this.editState = null;
    this.emit({ type: "STOP_EDIT" });
  }

  getEditState(): EditState | null {
    return this.editState ? { ...this.editState } : null;
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
    
    this.emit({ type: "SET_CONTENT_SIZE", width, height: this.virtualContentHeight });
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
   */
  getVisibleRowRange(): { start: number; end: number } {
    // viewportHeight includes header, so subtract it to get content area
    const contentHeight = this.viewportHeight - this.headerHeight;
    const firstVisibleRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight));
    const lastVisibleRow = Math.min(
      this.totalRows - 1,
      Math.floor((this.scrollTop + contentHeight) / this.rowHeight) - 1
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
    this.refreshAllSlots();
    this.emitContentSize();
  }

  /**
   * Refresh slot display without refetching data.
   * Useful after in-place data modifications like fill operations.
   */
  refreshSlotData(): void {
    this.refreshAllSlots();
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
    this.syncSlots();
  }
}

