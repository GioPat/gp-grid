import type {
  DataSourceRequest,
  FilterModel,
  SortModel,
} from "../types";

export interface BuildRequestOptions {
  pageIndex: number;
  pageSize: number;
  sortModel: SortModel[];
  filterModel: FilterModel;
}

/**
 * Build a DataSourceRequest, dropping empty sort/filter fields so data
 * sources don't need to null-check them. Shared by `fetchData` and
 * `refreshFromTransaction`.
 */
export const buildDataSourceRequest = (options: BuildRequestOptions): DataSourceRequest => ({
  pagination: { pageIndex: options.pageIndex, pageSize: options.pageSize },
  sort: options.sortModel.length > 0 ? options.sortModel : undefined,
  filter: Object.keys(options.filterModel).length > 0 ? options.filterModel : undefined,
});
