import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  HierarchicalRowAccess,
  HierarchyRow,
  RowAccess,
  RowId,
  WriteRejectionOperation,
  WriteRejectionReason,
} from "../types";
import type { AxisBounds } from "../types/geometry";
import {
  createWriteRejection,
  getFieldValue as readRowFieldValue,
  readCell,
  writeCell,
  writeRecordCell,
} from "../utils";

export interface RowStoreOptions<TData> {
  getColumns: () => ColumnDefinition[];
  getDataSource: () => DataSource<TData>;
  isWritable: () => boolean;
  getRowId?: (row: TData) => RowId;
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
}

const rangeStart = (range?: AxisBounds): number => Math.max(0, Math.trunc(range?.start ?? 0));

const rangeEnd = (range: AxisBounds | undefined, extent: number): number =>
  Math.min(Math.trunc(range?.end ?? extent), extent);

/**
 * Owns the row cache, the bound scalar access, the row count and the bound
 * hierarchy, and answers every row read and write by view index: through the
 * hierarchy while one is bound, through the flat rows otherwise (D2).
 */
export class RowStore<TData = unknown> {
  private readonly options: RowStoreOptions<TData>;
  private readonly cachedRows: Map<number, TData> = new Map();
  /**
   * Scalar access for a response that returns no materialized rows. When set,
   * it is the authoritative flat read path and the row cache stays empty.
   */
  private rowAccess: RowAccess | null = null;
  private hierarchy: HierarchicalRowAccess<TData> | null = null;
  private totalRows = 0;
  private revision = 0;

  constructor(options: RowStoreOptions<TData>) {
    this.options = options;
  }

  getCachedRows(): Map<number, TData> {
    return this.cachedRows;
  }

  getTotalRows(): number {
    return this.hierarchy?.rowCount ?? this.totalRows;
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

  /** Scalar access for the current response, when the source provides one. */
  getRowAccess(): RowAccess | null {
    return this.rowAccess;
  }

  /** Bind a response's scalar access, releasing the one it replaces; no record is materialized. */
  setRowAccess(next: RowAccess | null): void {
    if (this.rowAccess === next) return;
    this.rowAccess?.release?.();
    this.rowAccess = next;
  }

  getHierarchy(): HierarchicalRowAccess<TData> | null {
    return this.hierarchy;
  }

  /** Bind a hierarchy, releasing the one it replaces. */
  bindHierarchy(next: HierarchicalRowAccess<TData> | null): void {
    if (this.hierarchy === next) return;
    this.hierarchy?.release?.();
    this.hierarchy = next;
  }

  /** The view row's kind and depth; `undefined` while flat. */
  getHierarchyRow(viewIndex: number): HierarchyRow | undefined {
    return this.isResident(viewIndex) ? this.hierarchy?.getRow(viewIndex) : undefined;
  }

  private isResident(viewIndex: number): boolean {
    return this.hierarchy !== null && viewIndex >= 0 && viewIndex < this.hierarchy.rowCount;
  }

  /** Whether the bound source exposes a stable row identity (D2). */
  hasStableIdentity(): boolean {
    if (this.hierarchy) return true;
    if (this.rowAccess) return this.rowAccess.getRowId !== undefined;
    return this.options.getRowId !== undefined;
  }

  /**
   * View indices of the requested identities, within `range` when given. Scans
   * the resident rows, O(resident), and stops once every id has been found.
   */
  locateIds(ids: ReadonlySet<RowId>, range?: AxisBounds): Map<RowId, number> {
    const found = new Map<RowId, number>();
    const first = rangeStart(range);
    const { hierarchy } = this;
    if (hierarchy) {
      const end = rangeEnd(range, hierarchy.rowCount);
      for (let index = first; index < end && found.size < ids.size; index += 1) {
        const rowId = hierarchy.getRowId(index);
        if (ids.has(rowId)) found.set(rowId, index);
      }
      return found;
    }
    if (this.rowAccess) {
      const end = rangeEnd(range, this.rowAccess.rowCount);
      for (let index = first; index < end && found.size < ids.size; index += 1) {
        this.collectFlat(found, index, ids);
      }
      return found;
    }
    const end = rangeEnd(range, Number.MAX_SAFE_INTEGER);
    for (const index of this.cachedRows.keys()) {
      if (found.size === ids.size) break;
      if (index >= first && index < end) this.collectFlat(found, index, ids);
    }
    return found;
  }

  private collectFlat(found: Map<RowId, number>, row: number, ids: ReadonlySet<RowId>): void {
    const rowId = this.flatRowId(row);
    if (rowId !== undefined && ids.has(rowId)) found.set(rowId, row);
  }

  /** The record of a record row; `undefined` on group, total and columnar rows. */
  getRowData(rowIndex: number): TData | undefined {
    if (this.hierarchy) {
      if (this.getHierarchyRow(rowIndex)?.kind !== "record") return undefined;
      return this.hierarchy.getRecord?.(rowIndex);
    }
    return this.cachedRows.get(rowIndex);
  }

  /** Whether a view row exists and can be rendered; a columnar row renders with no record. */
  hasRow(rowIndex: number): boolean {
    if (this.hierarchy) return this.isResident(rowIndex);
    if (this.rowAccess) return rowIndex >= 0 && rowIndex < this.rowAccess.rowCount;
    return this.cachedRows.get(rowIndex) !== undefined;
  }

  /** Stable identity for a view row, when the source exposes one. */
  getRowId(viewRow: number): RowId | undefined {
    if (this.hierarchy) return this.isResident(viewRow) ? this.hierarchy.getRowId(viewRow) : undefined;
    return this.flatRowId(viewRow);
  }

  /** Identity of a flat row: from the scalar access, or the record's `getRowId`. */
  private flatRowId(row: number): RowId | undefined {
    if (this.rowAccess) {
      if (row < 0 || row >= this.rowAccess.rowCount) return undefined;
      return this.rowAccess.getRowId?.(row);
    }
    const record = this.cachedRows.get(row);
    return record === undefined ? undefined : this.options.getRowId?.(record);
  }

  /** Record lookup by identity: the source's direct lookup, else a scan of the flat rows, O(resident). */
  getRecordById(rowId: RowId): TData | undefined {
    const dataSource = this.options.getDataSource();
    if (dataSource.getRecordById) return dataSource.getRecordById(rowId);
    for (const [row, record] of this.cachedRows) {
      if (this.flatRowId(row) === rowId) return record;
    }
    return undefined;
  }

  /** View index of a row by identity, or -1. Under a hierarchy a hidden row is `-1`, never its visible ancestor. */
  findViewIndexById(rowId: RowId): number {
    if (this.hierarchy) {
      const viewIndex = this.hierarchy.locate(rowId);
      return this.getRowId(viewIndex) === rowId ? viewIndex : -1;
    }
    for (const row of this.cachedRows.keys()) {
      if (this.flatRowId(row) === rowId) return row;
    }
    return -1;
  }

  getCellValue(row: number, col: number): CellValue {
    const columns = this.options.getColumns();
    if (this.hierarchy === null && this.rowAccess === null) return readCell(this.cachedRows, columns, row, col);
    const column = columns[col];
    return column === undefined ? null : this.getFieldValue(row, column.field);
  }

  /** Any source field at a view row, independent of the displayed columns. */
  getFieldValue(viewIndex: number, field: string): CellValue {
    if (this.hierarchy) return this.isResident(viewIndex) ? this.hierarchy.getValue(viewIndex, field) : null;
    if (this.rowAccess) {
      if (viewIndex < 0 || viewIndex >= this.rowAccess.rowCount) return null;
      return this.rowAccess.getValue(viewIndex, field);
    }
    const row = this.cachedRows.get(viewIndex);
    return row === undefined ? null : readRowFieldValue(row, field);
  }

  /** D6: under a hierarchy only a record row with a record takes a write. */
  isRowWritable(viewIndex: number): boolean {
    return this.hierarchy === null || this.getRowData(viewIndex) !== undefined;
  }

  /** False when the write was refused, and reported. */
  setCellValue(row: number, col: number, value: CellValue): boolean {
    if (this.options.isWritable() === false) {
      this.rejectWrite(row, col, "setCellValue", "read-only-source");
      return false;
    }
    const hierarchy = this.hierarchy;
    if (hierarchy === null) {
      writeCell(this.cachedRows, this.options.getColumns(), row, col, value, {
        onCellValueChanged: this.options.onCellValueChanged,
        getRowId: this.options.getRowId,
      });
      return true;
    }
    const record = this.getRowData(row);
    if (record === undefined) {
      this.rejectWrite(row, col, "setCellValue", "not-a-record");
      return false;
    }
    const column = this.options.getColumns()[col];
    if (column === undefined) return false;
    writeRecordCell(record, column, col, value, this.options.onCellValueChanged, () => hierarchy.getRowId(row));
    return true;
  }

  /** Every refused write routes here, so a read-only source is observable consistently. */
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
