import type { WorkerPool } from "./utils/workerPool";

export type CellDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "dateString"
  | "dateTime"
  | "dateTimeString"
  | "object";

export type CellValue = string | number | boolean | Date | object | null;

// TODO: A valueGetter might be needed to access the value with custom logic instead of the "simple" dot notation
export interface ColumnDefinition {
  // The field that should use the dot notation to access sub-objects
  field: string;
  // The unique ID of the column, if missing, will fallback to the field parameter
  colId?: string;
  // The type of the column
  cellDataType: CellDataType;
  // Column width in pixels
  width: number;
  // Optional header name, defaults to field name
  headerName?: string;
  // Whether this column is editable (default: false)
  editable?: boolean;
}

export interface GridOptions {
  // Column definitions
  columns: ColumnDefinition[];
  // Row data array
  rowData: any[];
  // Default row height in pixels
  rowHeight: number;
  // Header row height in pixels (default: same as rowHeight)
  headerHeight?: number;
  // Show filter row below headers (default: false)
  showFilters?: boolean;
  // Threshold for using Web Workers for sorting (default: 500000)
  // Note: Workers have serialization overhead, main thread is faster for <500k rows
  workerSortThreshold?: number;
  // Whether to use Web Workers: true = pre-init, false = never, 'auto' = lazy (default: 'auto')
  useWorkers?: boolean | "auto";
  // Debounce delay for filters in milliseconds (default: 300)
  filterDebounce?: number;
}

// Cell position in the grid
export interface CellPosition {
  row: number;
  col: number;
}

// Cell layout information (x, y, dimensions)
export interface CellLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Complete cell information for rendering
export interface CellInfo extends CellPosition, CellLayout {
  value: CellValue;
  column: ColumnDefinition;
  isActive: boolean; // Is this the active (focused) cell?
  isSelected: boolean; // Is this cell in selection range?
  isEditing: boolean; // Is this cell being edited?
}

// Header cell information for rendering
export interface HeaderCellInfo extends CellLayout {
  col: number;
  column: ColumnDefinition;
  sortDirection?: "asc" | "desc";
  sortIndex?: number; // 1-based index for multi-column sort display
}

export type SortDirection = "asc" | "desc";

export interface SortModel {
  colId: string;
  direction: SortDirection;
}

export type FilterModel = Record<string, string>;

// Selection and editing types
export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface SelectionState {
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
}

export interface EditState {
  row: number;
  col: number;
  value: string;
}

export interface FillHandleState {
  sourceRow: number;
  sourceCol: number;
  targetRow: number;
  targetCol: number;
}

type RenderCallback = (cells: CellInfo[], headers: HeaderCellInfo[]) => void;

export class GridEngine {
  private opts: GridOptions;
  private renderCb?: RenderCallback;
  private refreshCb?: () => void; // Callback to trigger re-render after async operations
  private selectionChangeCb?: () => void; // Callback when selection changes
  private columnPositions: number[];
  private maxColumnWidth: number = 0;
  private sortModel: SortModel[] = [];
  private filterModel: FilterModel = {};
  private processedData: any[];
  private sourceData: any[]; // Mutable reference to source data
  private columnMap: Map<string, ColumnDefinition>;
  private fieldPathCache: Map<string, string[]>;
  private sortInfoMap: Map<string, { direction: SortDirection; index: number }>;
  private workerPool?: WorkerPool; // WorkerPool instance, loaded dynamically or pre-initialized

  // Selection and editing state
  private selectionState: SelectionState = {
    activeCell: null,
    selectionRange: null,
  };
  private editState: EditState | null = null;
  private fillHandleState: FillHandleState | null = null;

  constructor(opts: GridOptions) {
    this.opts = opts;
    this.sourceData = opts.rowData; // Store mutable reference
    this.columnPositions = this.computeColumnPositions();
    this.processedData = [...opts.rowData];

    // Build column lookup cache for O(1) access
    this.columnMap = new Map();
    for (const col of opts.columns) {
      const colId = col.colId || col.field;
      this.columnMap.set(colId, col);
    }

    // Initialize field path cache for memoization
    this.fieldPathCache = new Map();

    // Initialize sort info cache
    this.sortInfoMap = new Map();

    // Pre-initialize workers if explicitly requested
    if (opts.useWorkers === true) {
      this.initializeWorkers();
    }
  }

  private async initializeWorkers() {
    if (!this.workerPool) {
      const { getWorkerPool } = await import("./utils/workerPool");
      this.workerPool = getWorkerPool();
    }
  }

  private computeColumnPositions(): number[] {
    const positions: number[] = [0];
    let currentColPosition = 0;
    for (const col of this.opts.columns) {
      currentColPosition += col.width;
      positions.push(currentColPosition);
      if (col.width > this.maxColumnWidth) {
        this.maxColumnWidth = col.width;
      }
    }
    return positions;
  }

  private getFieldValue(data: any, field: string): CellValue {
    // Get cached field path or compute and cache it
    let parts = this.fieldPathCache.get(field);
    if (!parts) {
      parts = field.split(".");
      this.fieldPathCache.set(field, parts);
    }

    let value = data;
    for (const part of parts) {
      if (value == null) break;
      value = value[part];
    }
    return value ?? null;
  }

  private compareValues(
    aVal: CellValue,
    bVal: CellValue,
    direction: SortDirection,
  ): number {
    const aNum = aVal == null ? null : Number(aVal);
    const bNum = bVal == null ? null : Number(bVal);

    let comparison = 0;
    if (aVal == null && bVal == null) comparison = 0;
    else if (aVal == null) comparison = 1;
    else if (bVal == null) comparison = -1;
    else if (!isNaN(aNum!) && !isNaN(bNum!)) {
      comparison = aNum! - bNum!;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return direction === "asc" ? comparison : -comparison;
  }

  private async applyFiltersAndSort() {
    // Apply filters
    if (Object.keys(this.filterModel).length > 0) {
      // Pre-compute filter predicates for better performance
      const filterPredicates: Array<{
        column: ColumnDefinition;
        filterStr: string;
      }> = [];

      for (const [colId, filterValue] of Object.entries(this.filterModel)) {
        if (!filterValue) continue;
        const column = this.columnMap.get(colId);
        if (!column) continue;
        filterPredicates.push({
          column,
          filterStr: filterValue.toLowerCase(),
        });
      }

      // Filter from original data into processedData
      const filtered: any[] = [];
      for (const row of this.sourceData) {
        let matches = true;
        // Use for...of with break for early exit
        for (const predicate of filterPredicates) {
          const cellValue = this.getFieldValue(row, predicate.column.field);
          const cellStr = String(cellValue ?? "").toLowerCase();
          if (!cellStr.includes(predicate.filterStr)) {
            matches = false;
            break; // Early exit on first non-match
          }
        }
        if (matches) {
          filtered.push(row);
        }
      }

      this.processedData.splice(0, this.processedData.length, ...filtered);
    } else {
      // No filters - restore full dataset
      this.processedData.splice(
        0,
        this.processedData.length,
        ...this.sourceData,
      );
    }

    // Apply multi-column sort
    if (this.sortModel.length > 0) {
      const useWorkers = this.opts.useWorkers ?? "auto";
      const threshold = this.opts.workerSortThreshold ?? 500000;

      // Determine if we should use workers
      const shouldUseWorkers =
        useWorkers === true ||
        (useWorkers === "auto" &&
          this.processedData.length >= threshold &&
          typeof Worker !== "undefined");

      if (shouldUseWorkers) {
        await this.sortWithWorkers();
      } else {
        // Use main thread for datasets under threshold or when workers disabled
        this.sortOnMainThread();
      }
    }
  }

  private sortOnMainThread() {
    this.processedData.sort((a, b) => {
      // Compare by each sort column in order
      for (const sort of this.sortModel) {
        const column = this.columnMap.get(sort.colId);
        if (!column) continue;
        const aVal = this.getFieldValue(a, column.field);
        const bVal = this.getFieldValue(b, column.field);
        const result = this.compareValues(aVal, bVal, sort.direction);
        if (result !== 0) return result; // Order determined by this column
      }
      return 0; // All columns equal
    });
  }

  private async sortWithWorkers() {
    // Use pre-initialized pool or load on demand
    if (!this.workerPool) {
      await this.initializeWorkers();
    }

    const sortConfigs = this.sortModel.map((sort) => {
      const column = this.columnMap.get(sort.colId);
      return {
        field: column!.field,
        direction: sort.direction,
      };
    });

    try {
      const sorted = await this.workerPool!.parallelSort(
        this.processedData,
        sortConfigs,
      );
      this.processedData.splice(0, this.processedData.length, ...sorted);
    } catch (error) {
      console.error("Worker sort failed, falling back to main thread:", error);
      this.sortOnMainThread();
    }
  }

  private rebuildSortInfoMap() {
    this.sortInfoMap.clear();
    this.sortModel.forEach((sort, index) => {
      this.sortInfoMap.set(sort.colId, {
        direction: sort.direction,
        index: index + 1, // 1-based for display
      });
    });
  }

  getSortModel(): SortModel[] {
    return [...this.sortModel];
  }

  getOptions(): GridOptions {
    return this.opts;
  }

  getColumnPositions(): number[] {
    return this.columnPositions;
  }

  async setSort(
    colId: string,
    direction: SortDirection | null,
    addToExisting: boolean = false,
  ) {
    const existingIndex = this.sortModel.findIndex((s) => s.colId === colId);

    if (!addToExisting) {
      // Replace entire sort array (single sort mode)
      this.sortModel = direction === null ? [] : [{ colId, direction }];
    } else {
      // Add/update/remove from existing array (multi-sort mode)
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
    this.rebuildSortInfoMap();
    await this.applyFiltersAndSort();
    // Trigger re-render after async sort completes
    this.refreshCb?.();
  }

  async setFilter(colId: string, value: string) {
    if (value === "") {
      delete this.filterModel[colId];
    } else {
      this.filterModel[colId] = value;
    }
    await this.applyFiltersAndSort();
    // Trigger re-render after async sort completes
    this.refreshCb?.();
  }

  async updateRowData(newData: any[]) {
    this.sourceData = newData;
    await this.applyFiltersAndSort();
    // Trigger re-render after updating data
    this.refreshCb?.();
  }

  setActiveCell(row: number, col: number): void {
    const rowCount = this.processedData.length;
    const colCount = this.opts.columns.length;

    // Clamp to valid bounds
    row = Math.max(0, Math.min(row, rowCount - 1));
    col = Math.max(0, Math.min(col, colCount - 1));

    this.selectionState.activeCell = { row, col };
    this.selectionState.selectionRange = null; // Clear range selection
    this.selectionChangeCb?.();
  }

  getActiveCell(): CellPosition | null {
    return this.selectionState.activeCell;
  }

  setSelectionRange(range: CellRange): void {
    this.selectionState.selectionRange = range;
    this.selectionChangeCb?.();
  }

  getSelectionRange(): CellRange | null {
    return this.selectionState.selectionRange;
  }

  clearSelection(): void {
    this.selectionState.activeCell = null;
    this.selectionState.selectionRange = null;
    this.selectionChangeCb?.();
  }

  isSelectedCell(row: number, col: number): boolean {
    const { selectionRange } = this.selectionState;

    if (selectionRange) {
      const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
      const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
      const minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
      const maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);

      return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
    }

    return false;
  }

  moveSelection(
    direction: "up" | "down" | "left" | "right",
    extend: boolean,
  ): void {
    const { activeCell, selectionRange } = this.selectionState;

    if (!activeCell) {
      // No active cell, select first cell
      this.setActiveCell(0, 0);
      return;
    }

    let newRow = activeCell.row;
    let newCol = activeCell.col;

    switch (direction) {
      case "up":
        newRow = Math.max(0, newRow - 1);
        break;
      case "down":
        newRow = Math.min(this.processedData.length - 1, newRow + 1);
        break;
      case "left":
        newCol = Math.max(0, newCol - 1);
        break;
      case "right":
        newCol = Math.min(this.opts.columns.length - 1, newCol + 1);
        break;
    }

    if (extend) {
      // Extend selection range
      if (!selectionRange) {
        // Start new range from active cell
        this.selectionState.selectionRange = {
          startRow: activeCell.row,
          startCol: activeCell.col,
          endRow: newRow,
          endCol: newCol,
        };
      } else {
        // Extend existing range
        this.selectionState.selectionRange = {
          ...selectionRange,
          endRow: newRow,
          endCol: newCol,
        };
      }
      this.selectionState.activeCell = { row: newRow, col: newCol };
      this.selectionChangeCb?.();
    } else {
      // Move active cell without extending
      this.setActiveCell(newRow, newCol);
    }
  }

  // ===== Editing Management =====

  startEdit(row: number, col: number): void {
    const column = this.opts.columns[col];
    if (!column) return;

    // Check if column is editable (default to false if not specified)
    const isEditable = column.editable === true; // only true = editable
    if (!isEditable) return; // Don't start edit if column is not editable

    const rowData = this.processedData[row];
    if (!rowData) return;

    const value = this.getFieldValue(rowData, column.field);
    this.editState = {
      row,
      col,
      value: String(value ?? ""),
    };
    this.selectionChangeCb?.();
  }

  getEditState(): EditState | null {
    return this.editState;
  }

  updateEditValue(value: string): void {
    if (this.editState) {
      this.editState.value = value;
    }
  }

  async commitEdit(): Promise<void> {
    if (!this.editState) return;

    const { row, col, value } = this.editState;
    const rowData = this.processedData[row]; // Track the row data object
    this.setCellValue(row, col, value);
    this.editState = null;

    // Re-apply sort if active to reflect the edited data
    if (this.sortModel.length > 0) {
      await this.applyFiltersAndSort();

      // Find new position of edited row and update active cell
      const newRow = this.processedData.indexOf(rowData);
      if (newRow >= 0 && this.selectionState.activeCell) {
        this.selectionState.activeCell.row = newRow;
      }

      this.refreshCb?.();
    }

    this.selectionChangeCb?.();
  }

  cancelEdit(): void {
    this.editState = null;
    this.selectionChangeCb?.();
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    const rowData = this.processedData[row];
    if (!rowData) return;

    const column = this.opts.columns[col];
    if (!column) return;

    // Set value using field path (supports dot notation)
    const parts = column.field.split(".");
    let obj = rowData;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in obj)) {
        obj[part] = {};
      }
      obj = obj[part];
    }

    const lastPart = parts[parts.length - 1]!;
    obj[lastPart] = value;

    this.refreshCb?.();
  }

  // ===== Fill Handle Management =====

  startFillDrag(row: number, col: number): void {
    this.fillHandleState = {
      sourceRow: row,
      sourceCol: col,
      targetRow: row,
      targetCol: col,
    };
    this.selectionChangeCb?.();
  }

  updateFillDrag(targetRow: number, targetCol: number): void {
    if (!this.fillHandleState) return;

    // Clamp to valid bounds
    const rowCount = this.processedData.length;
    const colCount = this.opts.columns.length;
    targetRow = Math.max(0, Math.min(targetRow, rowCount - 1));
    targetCol = Math.max(0, Math.min(targetCol, colCount - 1));

    this.fillHandleState = {
      ...this.fillHandleState,
      targetRow,
      targetCol,
    };
    this.selectionChangeCb?.();
  }

  async commitFillDrag(): Promise<void> {
    if (!this.fillHandleState) return;

    const { sourceRow, sourceCol, targetRow, targetCol } = this.fillHandleState;

    // Get source value
    const sourceData = this.processedData[sourceRow];
    if (!sourceData) return;

    const column = this.opts.columns[sourceCol];
    if (!column) return;

    const sourceValue = this.getFieldValue(sourceData, column.field);

    // Fill all cells in range with source value
    const minRow = Math.min(sourceRow, targetRow);
    const maxRow = Math.max(sourceRow, targetRow);

    for (let r = minRow; r <= maxRow; r++) {
      if (r !== sourceRow) {
        // Don't overwrite source cell
        this.setCellValue(r, sourceCol, sourceValue);
      }
    }

    this.fillHandleState = null;

    // Re-apply sort if active to reflect the filled data
    if (this.sortModel.length > 0) {
      await this.applyFiltersAndSort();
      this.refreshCb?.();
    }

    this.selectionChangeCb?.();
  }

  cancelFillDrag(): void {
    this.fillHandleState = null;
    this.selectionChangeCb?.();
  }

  getFillHandleState(): FillHandleState | null {
    return this.fillHandleState;
  }

  // ===== Callbacks =====

  onRender(cb: RenderCallback) {
    this.renderCb = cb;
  }

  onRefresh(cb: () => void) {
    this.refreshCb = cb;
  }

  onSelectionChange(cb: () => void) {
    this.selectionChangeCb = cb;
  }

  /** Call on scroll to recompute visible cells */
  computeVisible(
    scrollTop: number,
    scrollLeft: number,
    viewportW: number,
    viewportH: number,
    overscan: number = 1,
  ) {
    const { rowHeight, columns, headerHeight = rowHeight } = this.opts;
    const rowCount = this.processedData.length;
    const colCount = columns.length;

    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endRow = Math.min(
      rowCount,
      startRow + Math.ceil(viewportH / rowHeight) + 1 + overscan * 2,
    );

    // Approximate visible columns using max width (O(1), may overestimate)
    const startCol = Math.max(
      0,
      Math.floor(scrollLeft / this.maxColumnWidth) - overscan,
    );
    const endCol = Math.min(
      colCount,
      startCol + Math.ceil(viewportW / this.maxColumnWidth) + 1 + overscan * 2,
    );

    // Generate header cells
    const headers: HeaderCellInfo[] = [];
    for (let c = startCol; c < endCol; c++) {
      const column = columns[c]!;
      const colId = column.colId || column.field;
      const sortInfo = this.sortInfoMap.get(colId);

      headers.push({
        col: c,
        x: this.columnPositions[c]!,
        y: 0,
        width: column.width,
        height: headerHeight,
        column,
        sortDirection: sortInfo?.direction,
        sortIndex: sortInfo?.index,
      });
    }

    // Generate data cells
    const cells: CellInfo[] = [];
    const { activeCell } = this.selectionState;
    const editState = this.editState;

    for (let r = startRow; r < endRow; r++) {
      const rowDataItem = this.processedData[r];
      for (let c = startCol; c < endCol; c++) {
        const column = columns[c]!;
        const value = this.getFieldValue(rowDataItem, column.field);

        const isActive = activeCell?.row === r && activeCell?.col === c;
        const isSelected = this.isSelectedCell(r, c);
        const isEditing = editState?.row === r && editState?.col === c;

        cells.push({
          row: r,
          col: c,
          x: this.columnPositions[c]!,
          y: r * rowHeight,
          width: column.width,
          height: rowHeight,
          value,
          column,
          isActive,
          isSelected,
          isEditing,
        });
      }
    }
    this.renderCb?.(cells, headers);
  }

  get totalWidth() {
    return this.columnPositions[this.columnPositions.length - 1];
  }

  get totalHeight() {
    // Inner div only contains data rows, header is in separate container
    return this.processedData.length * this.opts.rowHeight;
  }

  get headerHeight() {
    return this.opts.headerHeight ?? this.opts.rowHeight;
  }

  get showFilters() {
    return this.opts.showFilters ?? false;
  }
}
