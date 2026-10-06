import type {
  CellValue,
  FlatRowSource,
  HierarchicalRowAccess,
  HierarchyRow,
  RowAccess,
  RowId,
  SortModel,
  WriteRejectionOperation,
  WriteRejectionReason,
} from "../types";
import { writeRecordCell } from "../utils";
import type { AxisBounds } from "../types/geometry";
import { FlatRowStore, rangeEnd, rangeStart, type FlatRowStoreOptions } from "./flat-row-store";

const locateInHierarchy = (
  hierarchy: HierarchicalRowAccess<unknown>,
  ids: ReadonlySet<RowId>,
  range?: AxisBounds,
): Map<RowId, number> => {
  const found = new Map<RowId, number>();
  const end = rangeEnd(range, hierarchy.rowCount);
  for (let index = rangeStart(range); index < end && found.size < ids.size; index += 1) {
    const rowId = hierarchy.getRowId(index);
    if (ids.has(rowId)) found.set(rowId, index);
  }
  return found;
};

export type RowStoreOptions<TData> = FlatRowStoreOptions<TData>;

/**
 * Answers every row read and write by view index: straight through the flat
 * store while flat, through the bound hierarchy otherwise (D2).
 */
export class RowStore<TData = unknown> {
  private readonly options: RowStoreOptions<TData>;
  private readonly flat: FlatRowStore<TData>;
  private hierarchy: HierarchicalRowAccess<TData> | null = null;

  constructor(options: RowStoreOptions<TData>) {
    this.options = options;
    this.flat = new FlatRowStore<TData>(options);
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
    if (this.isResident(viewIndex) === false) return undefined;
    return this.hierarchy?.getRow(viewIndex);
  }

  private isResident(viewIndex: number): boolean {
    return this.hierarchy !== null && viewIndex >= 0 && viewIndex < this.hierarchy.rowCount;
  }

  getCachedRows(): Map<number, TData> {
    return this.flat.getCachedRows();
  }

  setCachedRows(rows: Map<number, TData>): void {
    this.flat.setCachedRows(rows);
  }

  getTotalRows(): number {
    if (this.hierarchy) return this.hierarchy.rowCount;
    return this.flat.getTotalRows();
  }

  setTotalRows(count: number): void {
    this.flat.setTotalRows(count);
  }

  getRevision(): number {
    return this.flat.getRevision();
  }

  bumpRevision(): void {
    this.flat.bumpRevision();
  }

  hasStableIdentity(): boolean {
    if (this.hierarchy) return true;
    return this.flat.hasStableIdentity();
  }

  locateIds(ids: ReadonlySet<RowId>, range?: AxisBounds): Map<RowId, number> {
    if (this.hierarchy) return locateInHierarchy(this.hierarchy, ids, range);
    return this.flat.locateIds(ids, range);
  }

  getRowAccess(): RowAccess | null {
    return this.flat.getRowAccess();
  }

  setRowAccess(next: RowAccess | null): void {
    this.flat.setRowAccess(next);
  }

  toFlatRowSource(sort: readonly SortModel[]): FlatRowSource {
    return this.flat.toFlatRowSource(sort);
  }

  getRowData(rowIndex: number): TData | undefined {
    if (this.hierarchy) {
      if (this.getHierarchyRow(rowIndex)?.kind !== "record") return undefined;
      return this.hierarchy.getRecord?.(rowIndex);
    }
    return this.flat.getRowData(rowIndex);
  }

  hasRow(rowIndex: number): boolean {
    if (this.hierarchy) return this.isResident(rowIndex);
    return this.flat.hasRow(rowIndex);
  }

  getRowId(viewRow: number): RowId | undefined {
    if (this.hierarchy) {
      return this.isResident(viewRow) ? this.hierarchy.getRowId(viewRow) : undefined;
    }
    return this.flat.getRowId(viewRow);
  }

  getRecordById(rowId: RowId): TData | undefined {
    return this.flat.getRecordById(rowId);
  }

  /** Under a hierarchy a hidden row is `-1`, never its visible ancestor. */
  findViewIndexById(rowId: RowId): number {
    if (this.hierarchy) {
      const viewIndex = this.hierarchy.locate(rowId);
      return this.getRowId(viewIndex) === rowId ? viewIndex : -1;
    }
    return this.flat.findViewIndexById(rowId);
  }

  getCellValue(row: number, col: number): CellValue {
    if (this.hierarchy) {
      const column = this.options.getColumns()[col];
      return column === undefined ? null : this.getFieldValue(row, column.field);
    }
    return this.flat.getCellValue(row, col);
  }

  getFieldValue(viewIndex: number, field: string): CellValue {
    if (this.hierarchy) {
      return this.isResident(viewIndex) ? this.hierarchy.getValue(viewIndex, field) : null;
    }
    return this.flat.getFieldValue(viewIndex, field);
  }

  /** D6: under a hierarchy only a record row with a record takes a write. */
  isRowWritable(viewIndex: number): boolean {
    return this.hierarchy === null || this.getRowData(viewIndex) !== undefined;
  }

  /** False when the write was refused, and reported. */
  setCellValue(row: number, col: number, value: CellValue): boolean {
    const hierarchy = this.hierarchy;
    if (hierarchy === null) return this.flat.setCellValue(row, col, value);
    if (this.options.isWritable() === false) {
      this.rejectWrite(row, col, "setCellValue", "read-only-source");
      return false;
    }
    const record = this.getRowData(row);
    const column = this.options.getColumns()[col];
    if (record === undefined) {
      this.rejectWrite(row, col, "setCellValue", "not-a-record");
      return false;
    }
    if (column === undefined) return false;
    const { onCellValueChanged } = this.options;
    writeRecordCell(record, column, col, value, onCellValueChanged, () => hierarchy.getRowId(row));
    return true;
  }

  rejectWrite(
    row: number,
    col: number,
    operation: WriteRejectionOperation,
    reason: WriteRejectionReason,
  ): void {
    this.flat.rejectWrite(row, col, operation, reason);
  }

  clear(): void {
    this.flat.clear();
  }
}
