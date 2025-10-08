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

type RenderCallback = (cells: CellInfo[]) => void;

export class GridEngine {
  private opts: GridOptions;
  private renderCb?: RenderCallback;
  private columnPositions: number[];
  private maxColumnWidth: number = 0;

  constructor(opts: GridOptions) {
    this.opts = opts;
    this.columnPositions = this.computeColumnPositions();
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
    const parts = field.split(".");
    let value = data;
    for (const part of parts) {
      if (value == null) return null;
      value = value[part];
    }
    return value;
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
    const { rowHeight, columns, rowData } = this.opts;
    const rowCount = rowData.length;
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

    const cells: CellInfo[] = [];
    for (let r = startRow; r < endRow; r++) {
      const rowDataItem = rowData[r];
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
    this.renderCb?.(cells);
  }

  get totalWidth() {
    return this.columnPositions[this.columnPositions.length - 1];
  }

  get totalHeight() {
    return this.opts.rowData.length * this.opts.rowHeight;
  }
}
