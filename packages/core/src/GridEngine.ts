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

type RenderCallback = (cells: CellInfo[], headers: HeaderCellInfo[]) => void;

export class GridEngine {
  private opts: GridOptions;
  private renderCb?: RenderCallback;
  private columnPositions: number[];
  private maxColumnWidth: number = 0;
  private sortModel: SortModel[] = [];
  private filterModel: FilterModel = {};
  private processedData: any[];
  private columnMap: Map<string, ColumnDefinition>;
  private fieldPathCache: Map<string, string[]>;
  private sortInfoMap: Map<string, { direction: SortDirection; index: number }>;

  constructor(opts: GridOptions) {
    this.opts = opts;
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
  }

  private computeColumnPositions(): number[] {
    const positions: number[] = [0];
    let x = 0;
    for (const col of this.opts.columns) {
      x += col.width;
      positions.push(x);
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

  private applyFiltersAndSort() {
    // Apply filters
    if (Object.keys(this.filterModel).length > 0) {
      // Filter from original data into processedData
      this.processedData.splice(
        0,
        this.processedData.length,
        ...this.opts.rowData.filter((row) => {
          let matches = true;
          Object.entries(this.filterModel).forEach(([colId, filterValue]) => {
            if (!filterValue || !matches) return;
            const column = this.columnMap.get(colId);
            if (!column) return;
            const cellValue = this.getFieldValue(row, column.field);
            const cellStr = String(cellValue ?? "").toLowerCase();
            const filterStr = filterValue.toLowerCase();
            if (!cellStr.includes(filterStr)) {
              matches = false;
            }
          });
          return matches;
        }),
      );
    } else {
      // No filters - restore full dataset
      this.processedData.splice(0, this.processedData.length, ...this.opts.rowData);
    }

    // Apply multi-column sort
    if (this.sortModel.length > 0) {
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

  setSort(
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
    this.applyFiltersAndSort();
  }

  setFilter(colId: string, value: string) {
    if (value === "") {
      delete this.filterModel[colId];
    } else {
      this.filterModel[colId] = value;
    }
    this.applyFiltersAndSort();
  }

  updateRowData(newRowData: any[]) {
    this.opts.rowData = newRowData;
    this.applyFiltersAndSort();
    // Trigger re-render by calling computeVisible with current scroll position
    if (this.renderCb) {
      // Force a re-render - the container should call computeVisible
      // This is a simple approach; ideally the renderer tracks scroll state
    }
  }

  onRender(cb: RenderCallback) {
    this.renderCb = cb;
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
    for (let r = startRow; r < endRow; r++) {
      const rowDataItem = this.processedData[r];
      for (let c = startCol; c < endCol; c++) {
        const column = columns[c]!;
        const value = this.getFieldValue(rowDataItem, column.field);
        cells.push({
          row: r,
          col: c,
          x: this.columnPositions[c]!,
          y: r * rowHeight,
          width: column.width,
          height: rowHeight,
          value,
          column,
        });
      }
    }
    this.renderCb?.(cells, headers);
  }

  get totalWidth() {
    return this.columnPositions[this.columnPositions.length - 1];
  }

  get totalHeight() {
    const headerHeight = this.opts.headerHeight ?? this.opts.rowHeight;
    return this.processedData.length * this.opts.rowHeight + headerHeight;
  }

  get headerHeight() {
    return this.opts.headerHeight ?? this.opts.rowHeight;
  }

  get showFilters() {
    return this.opts.showFilters ?? false;
  }
}
