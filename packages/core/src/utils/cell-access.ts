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
  if (!rowData || typeof rowData !== "object") return;
  const column = columns[col];
  if (!column) return;

  const emitChange = deps.onCellValueChanged !== undefined;
  const oldValue = emitChange ? getFieldValue(rowData, column.field) : undefined;

  setFieldValue(rowData as Record<string, unknown>, column.field, value);

  if (emitChange) {
    deps.onCellValueChanged!({
      rowId: deps.getRowId!(rowData),
      colIndex: col,
      field: column.field,
      oldValue: oldValue!,
      newValue: value,
      rowData,
    });
  }
};
