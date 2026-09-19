// packages/core/src/types/data-source.ts
// Data source types

import type { CellValue, RowId, SortModel } from "./basic";
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
   * Client data sources use these only for free-text condition operators
   * (contains, equals, ...) so they match the displayed value the user
   * typed against. Values-mode `selectedValues` always hold raw values and
   * ignore them. Server-side data sources may ignore them entirely.
   */
  valueFormatters?: Record<string, (v: CellValue) => string>;
  /**
   * Optional ColumnId -> source-field map. Keeps a displayed/stable column ID
   * distinct from the source-field key a columnar source indexes by. Object
   * sources may ignore it.
   */
  fieldMap?: Record<string, string>;
}

/**
 * Scalar, position-addressed read access to the view rows of a response.
 *
 * A source that cannot materialize a record per row returns a `RowAccess`
 * instead of filling `rows`. The grid then reads only the cells it renders.
 * `getValue` takes a VIEW row position (the current displayed order).
 */
export interface RowAccess {
  /** Number of view rows in this response. */
  readonly rowCount: number;
  /** Source revision this access belongs to, when the source declares one. */
  readonly revision?: number;
  /** Read a raw scalar at a VIEW row position by source field. */
  getValue(viewRow: number, field: string): CellValue;
  /** Stable identity for a view row, when the source declares one. */
  getRowId?(viewRow: number): RowId;
  /** Release projection/scratch storage owned by this access. */
  release?(): void;
}

/** Data source response */
export interface DataSourceResponse<TData = unknown> {
  /**
   * Materialized rows. Empty when `access` is the authoritative read path;
   * a source never fabricates placeholder rows to satisfy this field.
   */
  rows: TData[];
  /** Total rows */
  totalRows: number;
  /**
   * Optional scalar access. When present the grid ignores `rows` and reads
   * cells through this access instead of materializing records.
   */
  access?: RowAccess;
}

/** Data source interface */
export interface DataSource<TData = unknown> {
  /**
   * Loading mode preferred by this data source.
   * Undefined is treated as "all".
   */
  readonly loadMode?: DataSourceLoadMode;
  /**
   * Whether this source accepts writes. Defaults to `true` for the writable
   * object/mutable sources; a read-only source sets it to `false` and the
   * grid rejects every write path centrally.
   */
  readonly writable?: boolean;
  /** Query data based on the request (range, sort, filter). */
  query(request: DataSourceRequest): Promise<DataSourceResponse<TData>>;
  /**
   * Optional direct record lookup by stable identity. Sources that can answer
   * cheaply (e.g. an indexed store) implement it; the grid otherwise searches
   * only currently resident rows.
   */
  getRecordById?: (rowId: RowId) => TData | undefined;
  /** Optional cleanup method to release resources */
  destroy?: () => void;
  /** Move a row */
  moveRow?: (fromIndex: number, toIndex: number) => void;
}
