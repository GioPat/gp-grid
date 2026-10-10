// packages/core/src/row-grouping/flat-row-source.ts
// A host's flat rows as the engine reads them (D9). Reads stay live, so a
// regroup after a write sees the written records.

import {
  isColumnarDataSource,
  type CellValue,
  type FlatRowSource,
  type RowGroupingHost,
  type RowId,
} from "../types";
import { createFieldReader } from "../utils";

const recordReader = <TData>(rows: ReadonlyMap<number, TData>, field: string): ((row: number) => CellValue) => {
  const read = createFieldReader(field);
  return (row) => read(rows.get(row));
};

export const toFlatRowSource = <TData>(host: RowGroupingHost<TData>): FlatRowSource => {
  const access = host.getRowAccess();
  const rows = host.getCachedRows();
  const dataSource = host.getDataSource();
  const sourceFields = isColumnarDataSource(dataSource) ? dataSource.access.fields : [];
  const recordId = (row: number): RowId | undefined => {
    const record = rows.get(row);
    return record === undefined ? undefined : host.getRowId?.(record);
  };
  return {
    rowCount: access?.rowCount ?? rows.size,
    reader: (field) => (access ? (row) => access.getValue(row, field) : recordReader(rows, field)),
    getRowId: (row) => (access ? access.getRowId?.(row) : recordId(row)) ?? row,
    ...(access === null && { getRecord: (row: number) => rows.get(row) }),
    sort: host.getSortModel(),
    fieldOf: (columnId) => host.getColumns().find((column) => (column.colId ?? column.field) === columnId)?.field,
    fields: [...host.getColumns().map((column) => column.field), ...sourceFields],
  };
};
