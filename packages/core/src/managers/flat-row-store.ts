import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  FlatRowSource,
  RowAccess,
  RowId,
  SortModel,
  WriteRejectionOperation,
  WriteRejectionReason,
} from "../types";
import type { AxisBounds } from "../types/geometry";
import { isColumnarDataSource } from "../types";
import {
  createFieldReader,
  createWriteRejection,
  getFieldValue as readRowFieldValue,
  readCell,
  writeCell,
} from "../utils";

export const rangeStart = (range?: AxisBounds): number => Math.max(0, Math.trunc(range?.start ?? 0));

export const rangeEnd = (range: AxisBounds | undefined, extent: number): number =>
  Math.min(Math.trunc(range?.end ?? extent), extent);

export interface FlatRowStoreOptions<TData> {
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
export class FlatRowStore<TData = unknown> {
  private readonly options: FlatRowStoreOptions<TData>;
  private cachedRows: Map<number, TData> = new Map();
  /**
   * Scalar access for a response that returns no materialized rows. When set,
   * it is the authoritative read path: the row cache stays empty and cells are
   * read on demand instead of being copied into row objects.
   */
  private rowAccess: RowAccess | null = null;
  private totalRows = 0;
  private revision = 0;

  constructor(options: FlatRowStoreOptions<TData>) {
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

  /** Bumped whenever row order or membership may have changed (D6). */
  getRevision(): number {
    return this.revision;
  }

  bumpRevision(): void {
    this.revision += 1;
  }

  /** Whether the bound source exposes a stable row identity (D2). */
  hasStableIdentity(): boolean {
    if (this.rowAccess) return this.rowAccess.getRowId !== undefined;
    return this.options.getRowId !== undefined;
  }

  /**
   * View indices of the requested identities, optionally within one range.
   * Scans the resident rows, which is O(resident), and stops once every ID
   * has been found.
   */
  locateIds(ids: ReadonlySet<RowId>, range?: AxisBounds): Map<RowId, number> {
    const found = new Map<RowId, number>();
    const first = rangeStart(range);
    if (this.rowAccess) {
      const extent = this.rowAccess.rowCount;
      const end = Math.min(rangeEnd(range, extent), extent);
      for (let index = first; index < end; index += 1) {
        if (found.size === ids.size) break;
        this.collect(found, index, ids);
      }
      return found;
    }
    const end = rangeEnd(range, Number.MAX_SAFE_INTEGER);
    for (const index of this.cachedRows.keys()) {
      if (found.size === ids.size) break;
      if (index >= first && index < end) this.collect(found, index, ids);
    }
    return found;
  }

  private collect(found: Map<RowId, number>, index: number, ids: ReadonlySet<RowId>): void {
    const rowId = this.getRowId(index);
    if (rowId !== undefined && ids.has(rowId)) found.set(rowId, index);
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

  /**
   * The flat rows as the local grouping engine reads them (D9). Reads stay
   * live, so a regroup after a write sees the written records.
   */
  toFlatRowSource(sort: readonly SortModel[]): FlatRowSource {
    const access = this.rowAccess;
    const dataSource = this.options.getDataSource();
    const columns = this.options.getColumns();
    const sourceFields = isColumnarDataSource(dataSource) ? dataSource.access.fields : [];
    const readRecord = (field: string) => {
      const read = createFieldReader(field);
      return (row: number) => read(this.cachedRows.get(row));
    };
    return {
      rowCount: access?.rowCount ?? this.cachedRows.size,
      reader: (field) => (access ? (row) => access.getValue(row, field) : readRecord(field)),
      getRowId: (row) => this.getRowId(row) ?? row,
      ...(access === null && { getRecord: (row: number) => this.cachedRows.get(row) }),
      sort,
      fieldOf: (columnId) =>
        this.options.getColumns().find((column) => (column.colId ?? column.field) === columnId)?.field,
      fields: [...columns.map((column) => column.field), ...sourceFields],
    };
  }

  /** False when the write was refused. */
  setCellValue(row: number, col: number, value: CellValue): boolean {
    if (this.options.isWritable() === false) {
      this.rejectWrite(row, col, "setCellValue", "read-only-source");
      return false;
    }
    writeCell(this.cachedRows, this.options.getColumns(), row, col, value, {
      onCellValueChanged: this.options.onCellValueChanged,
      getRowId: this.options.getRowId,
    });
    return true;
  }

  /**
   * Report a refused write through the single diagnostic contract. Every write
   * entry point routes here so a read-only source is observable consistently.
   */
  rejectWrite(
    row: number,
    col: number,
    operation: WriteRejectionOperation,
    reason: WriteRejectionReason,
  ): void {
    const column = this.options.getColumns()[col];
    this.options.onWriteRejected?.(
      createWriteRejection(row, col, column?.field ?? "", operation, reason),
    );
  }

  clear(): void {
    this.cachedRows.clear();
    this.totalRows = 0;
  }
}
