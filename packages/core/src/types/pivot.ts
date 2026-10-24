// packages/core/src/types/pivot.ts
// Pivot schema and configuration (PRD 012 D2, D3).

import type { CellValue } from "./basic";
import type { ColumnGroupChild } from "./column-groups";
import type { ColumnDefinition } from "./columns";
import type { DataSource } from "./data-source";
import type { RowGroupDimension, RowGroupingState, RowGroupMeasure } from "./row-groups";
import type { GroupPathStep } from "./server-grouping";

/** `column` overrides the generated leaf's defaults; `colId`, `field`, `editable` and `filterable` stay fixed. */
export type PivotMeasure = RowGroupMeasure & { column?: Partial<ColumnDefinition> };

/** The generated columns, label column first, and the header groups over them. */
export interface PivotSchema {
  columns: ColumnDefinition[];
  columnGroups: ColumnGroupChild[];
}

export interface PivotSchemaOptions {
  measures: readonly PivotMeasure[];
  /** Overrides the label column's defaults but its `colId` and `field`. */
  labelColumn?: Partial<ColumnDefinition>;
  /** One column per measure over every tuple, under the row totals group. Default: false. */
  rowTotals?: boolean;
  /** Header of the row totals group. Default: "Total". */
  rowTotalsHeader?: string;
  /** Header text of a tuple step. Default: `(Blanks)` for null, `YYYY-MM-DD` for a date, `String(key)` otherwise. */
  formatKey?: (step: GroupPathStep) => string;
}

export interface PivotConfig {
  rows: readonly RowGroupDimension[];
  pivots: readonly RowGroupDimension[];
  measures: readonly PivotMeasure[];
  /** The keys of a pivot dimension by its id, in column order. */
  domain?: Readonly<Record<string, readonly CellValue[]>>;
  /** Default: false. */
  rowTotals?: boolean;
  /** Default: "Total". */
  rowTotalsHeader?: string;
  grandTotal?: "top" | "bottom";
  /** Default: 0. */
  defaultExpandedDepth?: number;
  initialState?: RowGroupingState;
  /** Most generated columns a schema may have. Default: 1,000. */
  maxColumns?: number;
  labelColumn?: Partial<ColumnDefinition>;
  formatKey?: (step: GroupPathStep) => string;
}

export interface PivotSource<TData> extends DataSource<TData> {
  readonly loadMode: "all";
  readonly writable: false;
  /** The last built schema, `null` before the first query. */
  getSchema(): PivotSchema | null;
  /** Called synchronously with each changed schema before its query resolves. */
  subscribeSchema(listener: (schema: PivotSchema) => void): () => void;
  getState(): RowGroupingState;
  destroy(): void;
}
