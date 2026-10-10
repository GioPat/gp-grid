// packages/core/src/row-grouping/flat-row-source.ts
// A host's flat rows as the engine reads them. Reads stay live, so a regroup
// after a write sees the written records.

import { isColumnarDataSource, type CellValue, type RowId } from "../types";
import { createFieldReader } from "../utils";
import type { FlatRowSource, RowGroupingHost } from "../types/row-grouping-engine";

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
  const columns = host.getColumns();
  const fieldByColumnId = new Map(columns.map((column) => [column.colId ?? column.field, column.field]));
  return {
    rowCount: access?.rowCount ?? rows.size,
    reader: (field) => (access ? (row) => access.getValue(row, field) : recordReader(rows, field)),
    getRowId: (row) => (access ? access.getRowId?.(row) : recordId(row)) ?? row,
    ...(access === null && { getRecord: (row: number) => rows.get(row) }),
    sort: host.getSortModel(),
    fieldOf: (columnId) => fieldByColumnId.get(columnId),
    fields: [...columns.map((column) => column.field), ...sourceFields],
  };
};
