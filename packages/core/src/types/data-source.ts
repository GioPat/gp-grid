// packages/core/src/types/data-source.ts
// Data source types

import type { CellValue, SortModel } from "./basic";
import type { FilterModel } from "./filters";

/** Data loading mode advertised by a data source */
export type DataSourceLoadMode = "all" | "paginated";

/** Absolute row range requested from a data source. endRow is exclusive. */
export interface DataSourceRange {
  /** First row index to fetch */
  startRow: number;
  /** First row index after the requested range */
  endRow: number;
}

/** Data source request */
export interface DataSourceRequest {
  /** Absolute row range to fetch. endRow is exclusive. */
  range: DataSourceRange;
  /** Sort */
  sort?: SortModel[];
  /** Filter */
  filter?: FilterModel;
  /**
   * Per-field value formatters, derived from column definitions.
   * Client data sources use these so text filters compare against the
   * displayed (formatted) value. Server-side data sources may ignore them.
   */
  valueFormatters?: Record<string, (v: CellValue) => string>;
}

/** Data source response */
export interface DataSourceResponse<TData = unknown> {
  /** Rows */
  rows: TData[];
  /** Total rows */
  totalRows: number;
}

/** Data source interface */
export interface DataSource<TData = unknown> {
  /**
   * Loading mode preferred by this data source.
   * Undefined is treated as "all".
   */
  readonly loadMode?: DataSourceLoadMode;
  /** Query data based on the request (range, sort, filter). */
  query(request: DataSourceRequest): Promise<DataSourceResponse<TData>>;
  /** Optional cleanup method to release resources */
  destroy?: () => void;
  /** Move a row */
  moveRow?: (fromIndex: number, toIndex: number) => void;
}
