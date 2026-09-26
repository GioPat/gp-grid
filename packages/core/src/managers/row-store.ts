import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  RowAccess,
  RowId,
  WriteRejectionOperation,
} from "../types";
import {
  createWriteRejection,
  getFieldValue as readRowFieldValue,
  readCell,
  writeCell,
} from "../utils";

export interface RowStoreOptions<TData> {
  getColumns: () => ColumnDefinition[];
  getDataSource: () => DataSource<TData>;
  isWritable: () => boolean;
  getRowId?: (row: TData) => RowId;
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
}

/**
 * Owns the row cache, the bound scalar access and the row count, and answers
 * every typed read and write against them.
 */
export class RowStore<TData = unknown> {
  private readonly options: RowStoreOptions<TData>;
  private cachedRows: Map<number, TData> = new Map();
  /**
   * Scalar access for a response that returns no materialized rows. When set,
   * it is the authoritative read path: the row cache stays empty and cells are
   * read on demand instead of being copied into row objects.
   */
  private rowAccess: RowAccess | null = null;
  private totalRows = 0;

  constructor(options: RowStoreOptions<TData>) {
    this.options = options;
  }

  getCachedRows(): Map<number, TData> {
    return this.cachedRows;
  }

  setCachedRows(rows: Map<number, TData>): void {
    this.cachedRows = rows;
  }

  getTotalRows(): number {
    return this.totalRows;
  }

  setTotalRows(count: number): void {
    this.totalRows = count;
  }

  /** Scalar access for the current response, when the source provides one. */
  getRowAccess(): RowAccess | null {
    return this.rowAccess;
  }

  /**
   * Bind a response's scalar access, releasing any projection owned by the
   * previous one. The row cache is left empty: no record is materialized.
   */
  setRowAccess(next: RowAccess | null): void {
    if (this.rowAccess === next) return;
    this.rowAccess?.release?.();
    this.rowAccess = next;
  }

  getRowData(rowIndex: number): TData | undefined {
    return this.cachedRows.get(rowIndex);
  }

  /**
   * Whether a view row exists and can be rendered. Independent of whether a
   * source record is available: a columnar row renders with no record.
   */
  hasRow(rowIndex: number): boolean {
    if (this.rowAccess) {
      return rowIndex >= 0 && rowIndex < this.rowAccess.rowCount;
    }
    return this.cachedRows.get(rowIndex) !== undefined;
  }

  /** Stable identity for a view row, when the source exposes one. */
  getRowId(viewRow: number): RowId | undefined {
    if (this.rowAccess) {
      if (viewRow < 0 || viewRow >= this.rowAccess.rowCount) return undefined;
      return this.rowAccess.getRowId?.(viewRow);
    }
    const row = this.cachedRows.get(viewRow);
    if (row === undefined) return undefined;
    return this.options.getRowId?.(row);
  }

  /**
   * Record lookup by stable identity. Uses the source's direct lookup when
   * present; otherwise scans the resident rows, which is O(resident).
   */
  getRecordById(rowId: RowId): TData | undefined {
    const dataSource = this.options.getDataSource();
    if (dataSource.getRecordById) return dataSource.getRecordById(rowId);
    for (const [viewIndex, row] of this.cachedRows) {
      if (this.getRowId(viewIndex) === rowId) return row;
    }
    return undefined;
  }

  /** View index of a resident record by identity, or -1. O(resident). */
  findViewIndexById(rowId: RowId): number {
    for (const viewIndex of this.cachedRows.keys()) {
      if (this.getRowId(viewIndex) === rowId) return viewIndex;
    }
    return -1;
  }

  getCellValue(row: number, col: number): CellValue {
    if (this.rowAccess) {
      const column = this.options.getColumns()[col];
      if (column === undefined) return null;
      if (row < 0 || row >= this.rowAccess.rowCount) return null;
      return this.rowAccess.getValue(row, column.field);
    }
    return readCell(this.cachedRows, this.options.getColumns(), row, col);
  }

  /**
   * Read any source field at a view row, independent of the displayed
   * columns. Columnar rows read scalar access; object rows read the record.
   */
  getFieldValue(viewIndex: number, field: string): CellValue {
    if (this.rowAccess) {
      if (viewIndex < 0 || viewIndex >= this.rowAccess.rowCount) return null;
      return this.rowAccess.getValue(viewIndex, field);
    }
    const row = this.cachedRows.get(viewIndex);
    if (row === undefined) return null;
    return readRowFieldValue(row, field);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    if (this.options.isWritable() === false) {
      this.rejectWrite(row, col, "setCellValue");
      return;
    }
    writeCell(this.cachedRows, this.options.getColumns(), row, col, value, {
      onCellValueChanged: this.options.onCellValueChanged,
      getRowId: this.options.getRowId,
    });
  }

  /**
   * Report a refused write through the single diagnostic contract. Every write
   * entry point routes here so a read-only source is observable consistently.
   */
  rejectWrite(
    row: number,
    col: number,
    operation: WriteRejectionOperation,
  ): void {
    const column = this.options.getColumns()[col];
    this.options.onWriteRejected?.(
      createWriteRejection(row, col, column?.field ?? "", operation),
    );
  }

  clear(): void {
    this.cachedRows.clear();
    this.totalRows = 0;
  }
}
