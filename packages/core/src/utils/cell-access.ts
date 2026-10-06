import type {
  CellValue,
  CellValueChangedEvent,
  ColumnDefinition,
  RowId,
} from "../types";
import { getFieldValue, setFieldValue } from "../indexed-data-store/field-helpers";

/**
 * Read the field value at (row, col). Returns null when the row isn't
 * cached or the column is missing.
 */
export const readCell = <TData>(
  cachedRows: Map<number, TData>,
  columns: ColumnDefinition[],
  row: number,
  col: number,
): CellValue => {
  const rowData = cachedRows.get(row);
  if (!rowData) return null;
  const column = columns[col];
  if (!column) return null;
  return getFieldValue(rowData, column.field);
};

export interface WriteCellDeps<TData> {
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  getRowId?: (row: TData) => RowId;
}

/**
 * Mutate the field value at (row, col) in-place. Invokes the change
 * callback when one is configured; no-op when the row or column is
 * missing. The callback requires `getRowId` — enforced at construction
 * time by GridCore.
 */
export const writeCell = <TData>(
  cachedRows: Map<number, TData>,
  columns: ColumnDefinition[],
  row: number,
  col: number,
  value: CellValue,
  deps: WriteCellDeps<TData>,
): void => {
  const rowData = cachedRows.get(row);
  const column = columns[col];
  if (!rowData || !column) return;
  writeRecordCell(rowData, column, col, value, deps.onCellValueChanged, () => deps.getRowId!(rowData));
};

/** Mutate one record's field in place and report the change; no-op on a non-object record. */
export const writeRecordCell = <TData>(
  rowData: TData,
  column: ColumnDefinition,
  col: number,
  value: CellValue,
  onCellValueChanged: ((event: CellValueChangedEvent<TData>) => void) | undefined,
  getRowId: () => RowId,
): void => {
  if (typeof rowData !== "object" || rowData === null) return;
  const oldValue = onCellValueChanged === undefined ? null : getFieldValue(rowData, column.field);
  setFieldValue(rowData as Record<string, unknown>, column.field, value);
  onCellValueChanged?.({
    rowId: getRowId(),
    columnId: column.colId ?? column.field,
    colIndex: col,
    field: column.field,
    oldValue,
    newValue: value,
    rowData,
  });
};
