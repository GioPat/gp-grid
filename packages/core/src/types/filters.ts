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
}

/** Number filter condition */
export interface NumberFilterCondition {
  type: "number";
  operator: NumberFilterOperator;
  value?: number;
  /** Second value for "between" operator */
  valueTo?: number;
}

/** Date filter condition */
export interface DateFilterCondition {
  type: "date";
  operator: DateFilterOperator;
  value?: Date | string;
  /** Second value for "between" operator */
  valueTo?: Date | string;
}

/** Union of filter condition types */
export type FilterCondition =
  | TextFilterCondition
  | NumberFilterCondition
  | DateFilterCondition;

/** A visibly grouped set of conditions joined by one operator. */
export interface FilterConditionGroup {
  conditions: FilterCondition[];
  combination: FilterCombination;
}

/** Column filter model with one explicit level of condition groups. */
export interface ColumnFilterModel {
  groups: FilterConditionGroup[];
  combination: FilterCombination;
}

/**
 * Condition shape accepted when restoring a filter created before grouped
 * composition was introduced.
 */
export type LegacyFilterCondition = FilterCondition & {
  /** Operator connecting this condition to the next. */
  nextOperator?: FilterCombination;
};

/** Legacy left-to-right column filter model accepted as migration input. */
export interface LegacyColumnFilterModel {
  conditions: LegacyFilterCondition[];
  combination: FilterCombination;
}

/** Canonical or legacy input accepted by the imperative filter API. */
export type ColumnFilterInput = ColumnFilterModel | LegacyColumnFilterModel;

/** Filter model type - maps column ID to filter */
export type FilterModel = Record<string, ColumnFilterModel>;
