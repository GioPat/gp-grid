// packages/core/src/types/data-source.ts
// Data source types

import type { Row, SortModel } from "./basic";
import type { FilterModel } from "./filters";

/** Data source request */
export interface DataSourceRequest {
  /** Pagination */
  pagination: {
    /** Page index */
    pageIndex: number;
    /** Page size */
    pageSize: number;
  };
  /** Sort */
  sort?: SortModel[];
  /** Filter */
  filter?: FilterModel;
}

/** Data source response */
export interface DataSourceResponse<TData = Row> {
  /** Rows */
  rows: TData[];
  /** Total rows */
  totalRows: number;
}

/** Data source interface */
export interface DataSource<TData = Row> {
  /** Fetch data based on the request */
  fetch(request: DataSourceRequest): Promise<DataSourceResponse<TData>>;
  /** Optional cleanup method to release resources */
  destroy?: () => void;
  /** Move a row */
  moveRow?: (fromIndex: number, toIndex: number) => void;
}
