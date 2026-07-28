// packages/core/src/types/filters.ts
// Filter types

import type { CellValue } from "./basic";

/** Text filter operators */
export type TextFilterOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "notEquals"
  | "startsWith"
  | "endsWith"
  | "blank"
  | "notBlank";

/** Number filter operators (symbols for display) */
export type NumberFilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "between"
  | "blank"
  | "notBlank";

/** Date filter operators */
export type DateFilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | "blank"
  | "notBlank";

/** Filter combination mode */
export type FilterCombination = "and" | "or";

/** Text filter condition */
export interface TextFilterCondition {
  type: "text";
  operator: TextFilterOperator;
  value?: string;
  /**
   * Raw cell values selected in values (checkbox) mode.
   *
   * These are raw values, never formatted labels: server-side data sources
   * receive them as-is in `DataSourceRequest.filter`, and display formatting
   * (`ColumnDefinition.valueFormatter`) never enters the filter model. Treat
   * the set as immutable — replace it to change the selection. When
   * serializing a request for a server, convert the Set to an array.
   */
  selectedValues?: Set<CellValue>;
  /** Include blank values */
  includeBlank?: boolean;
  /** Operator connecting this condition to the next. Defaults to ColumnFilterModel.combination */
  nextOperator?: FilterCombination;
}

/** Number filter condition */
export interface NumberFilterCondition {
  type: "number";
  operator: NumberFilterOperator;
  value?: number;
  /** Second value for "between" operator */
  valueTo?: number;
  /** Operator connecting this condition to the next. Defaults to ColumnFilterModel.combination */
  nextOperator?: FilterCombination;
}

/** Date filter condition */
export interface DateFilterCondition {
  type: "date";
  operator: DateFilterOperator;
  value?: Date | string;
  /** Second value for "between" operator */
  valueTo?: Date | string;
  /** Operator connecting this condition to the next. Defaults to ColumnFilterModel.combination */
  nextOperator?: FilterCombination;
}

/** Union of filter condition types */
export type FilterCondition =
  | TextFilterCondition
  | NumberFilterCondition
  | DateFilterCondition;

/** Column filter model with multiple conditions */
export interface ColumnFilterModel {
  conditions: FilterCondition[];
  combination: FilterCombination;
}

/** Filter model type - maps column ID to filter */
export type FilterModel = Record<string, ColumnFilterModel>;
