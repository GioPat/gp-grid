// packages/core/src/types/row-grouping-engine.ts
// What core and the engine exchange; nothing here is part of the public API, so
// `types/index.ts` does not export it.

import type {
  CellValue,
  ColumnDefinition,
  DataSource,
  HierarchicalRowAccess,
  RowAccess,
  RowGrouping,
  RowGroupingRejection,
  RowId,
  SortModel,
} from "./index";

/** The flat rows the engine reads, addressed by flat position. */
export interface FlatRowSource {
  readonly rowCount: number;
  /** Resolves the field once; the reader takes a flat position. */
  reader(field: string): (row: number) => CellValue;
  /** A row without a source identity answers its flat position. */
  getRowId(row: number): RowId;
  getRecord?(row: number): unknown;
  readonly sort: readonly SortModel[];
  /** Source field of a column, or `undefined` for an unknown column. */
  fieldOf(columnId: string): string | undefined;
  /** Declared column fields and, for a columnar source, its fields. */
  readonly fields: readonly string[];
}

/** One grid's flat rows, and why it may not group them. One host serves one grid. */
export interface RowGroupingHost<TData = unknown> {
  /** The source returned its own hierarchy; it stays bound. */
  hasSourceHierarchy(): boolean;
  /** Paginated loading, or a response shorter than its total. */
  isPartial(): boolean;
  getSortModel(): readonly SortModel[];
  getColumns(): readonly ColumnDefinition[];
  getDataSource(): DataSource<TData>;
  getRowAccess(): RowAccess | null;
  getCachedRows(): ReadonlyMap<number, TData>;
  getRowId?: (row: TData) => RowId;
  onRowGroupingRejected?: (rejection: RowGroupingRejection) => void;
}

export interface RowGroupingEngine extends RowGrouping {
  /** Groups `source`'s rows, or rejects a field it lacks or an object key. */
  build(source: FlatRowSource): HierarchicalRowAccess | RowGroupingRejection;
  /** The hierarchy over `host`'s flat rows, or the rejection it reported and warned once per reason and host. */
  regroup<TData>(host: RowGroupingHost<TData>): HierarchicalRowAccess | RowGroupingRejection;
}

/** A `RowGrouping` is only ever made by `createRowGrouping`; anything else is refused loudly. */
export const asRowGroupingEngine = (grouping: RowGrouping): RowGroupingEngine => {
  if (typeof (grouping as Partial<RowGroupingEngine>).regroup !== "function") {
    throw new TypeError("rowGrouping must be created by createRowGrouping");
  }
  return grouping as RowGroupingEngine;
};
