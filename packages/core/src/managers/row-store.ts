import type { CellValue, RowAccess, RowId, WriteRejectionOperation } from "../types";
import type { AxisBounds } from "../types/geometry";
import { FlatRowStore, type FlatRowStoreOptions } from "./flat-row-store";

export type RowStoreOptions<TData> = FlatRowStoreOptions<TData>;

/** Answers every row read and write by view index over the flat store. */
export class RowStore<TData = unknown> {
  private readonly flat: FlatRowStore<TData>;

  constructor(options: RowStoreOptions<TData>) {
    this.flat = new FlatRowStore<TData>(options);
  }

  getCachedRows(): Map<number, TData> {
    return this.flat.getCachedRows();
  }

  setCachedRows(rows: Map<number, TData>): void {
    this.flat.setCachedRows(rows);
  }

  getTotalRows(): number {
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
    return this.flat.hasStableIdentity();
  }

  locateIds(ids: ReadonlySet<RowId>, range?: AxisBounds): Map<RowId, number> {
    return this.flat.locateIds(ids, range);
  }

  getRowAccess(): RowAccess | null {
    return this.flat.getRowAccess();
  }

  setRowAccess(next: RowAccess | null): void {
    this.flat.setRowAccess(next);
  }

  getRowData(rowIndex: number): TData | undefined {
    return this.flat.getRowData(rowIndex);
  }

  hasRow(rowIndex: number): boolean {
    return this.flat.hasRow(rowIndex);
  }

  getRowId(viewRow: number): RowId | undefined {
    return this.flat.getRowId(viewRow);
  }

  getRecordById(rowId: RowId): TData | undefined {
    return this.flat.getRecordById(rowId);
  }

  findViewIndexById(rowId: RowId): number {
    return this.flat.findViewIndexById(rowId);
  }

  getCellValue(row: number, col: number): CellValue {
    return this.flat.getCellValue(row, col);
  }

  getFieldValue(viewIndex: number, field: string): CellValue {
    return this.flat.getFieldValue(viewIndex, field);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    this.flat.setCellValue(row, col, value);
  }

  rejectWrite(row: number, col: number, operation: WriteRejectionOperation): void {
    this.flat.rejectWrite(row, col, operation);
  }

  clear(): void {
    this.flat.clear();
  }
}
