import type {
  CellValue,
  ColumnDefinition,
  DataSourceRequest,
  DataSourceRange,
  FilterModel,
  SortModel,
} from "../types";

export interface BuildRequestOptions {
  range: DataSourceRange;
  sortModel: SortModel[];
  filterModel: FilterModel;
  /**
   * Columns whose valueFormatter should travel with the request so that
   * client-side free-text condition filtering can match the displayed value.
   * Values-mode `selectedValues` compare raw values and do not use them.
   */
  columns?: ColumnDefinition[];
}

const collectValueFormatters = (
  columns: ColumnDefinition[] | undefined,
): Record<string, (v: CellValue) => string> | undefined => {
  if (!columns || columns.length === 0) return undefined;
  const formatters: Record<string, (v: CellValue) => string> = {};
  for (const column of columns) {
    if (column.valueFormatter) {
      formatters[column.colId ?? column.field] = column.valueFormatter;
    }
  }
  return Object.keys(formatters).length > 0 ? formatters : undefined;
};

const collectFieldMap = (
  columns: ColumnDefinition[] | undefined,
): Record<string, string> | undefined => {
  if (!columns || columns.length === 0) return undefined;
  let hasDistinctId = false;
  const fieldMap: Record<string, string> = {};
  for (const column of columns) {
    const columnId = column.colId ?? column.field;
    fieldMap[columnId] = column.field;
    if (columnId !== column.field) hasDistinctId = true;
  }
  return hasDistinctId ? fieldMap : undefined;
};

/**
 * Build a DataSourceRequest, dropping empty sort/filter fields so data
 * sources don't need to null-check them. Shared by `fetchData` and
 * `refreshFromTransaction`.
 */
export const buildDataSourceRequest = (options: BuildRequestOptions): DataSourceRequest => ({
  range: options.range,
  sort: options.sortModel.length > 0 ? options.sortModel : undefined,
  filter: Object.keys(options.filterModel).length > 0 ? options.filterModel : undefined,
  valueFormatters: collectValueFormatters(options.columns),
  fieldMap: collectFieldMap(options.columns),
});
