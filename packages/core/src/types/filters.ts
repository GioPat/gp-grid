// packages/core/src/types/filters.ts
// Filter types

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
  /** Selected distinct values for checkbox-style filtering */
  selectedValues?: Set<string>;
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

/** Column filter model with multiple conditions */
export interface ColumnFilterModel {
  conditions: FilterCondition[];
  combination: FilterCombination;
}

/** Filter model type - maps column ID to filter */
export type FilterModel = Record<string, ColumnFilterModel>;
