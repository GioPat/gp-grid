import type {
  CellValue,
  ColumnDefinition,
  DataSourceRequest,
  FilterModel,
  SortModel,
} from "../types";

export interface BuildRequestOptions {
  pageIndex: number;
  pageSize: number;
  sortModel: SortModel[];
  filterModel: FilterModel;
  /**
   * Columns whose valueFormatter should travel with the request so that
   * client-side filtering can match the displayed value.
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

/**
 * Build a DataSourceRequest, dropping empty sort/filter fields so data
 * sources don't need to null-check them. Shared by `fetchData` and
 * `refreshFromTransaction`.
 */
export const buildDataSourceRequest = (options: BuildRequestOptions): DataSourceRequest => ({
  pagination: { pageIndex: options.pageIndex, pageSize: options.pageSize },
  sort: options.sortModel.length > 0 ? options.sortModel : undefined,
  filter: Object.keys(options.filterModel).length > 0 ? options.filterModel : undefined,
  valueFormatters: collectValueFormatters(options.columns),
});
