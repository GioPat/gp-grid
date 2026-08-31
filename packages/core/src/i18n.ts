// packages/core/src/i18n.ts
// Shared, framework-agnostic label model for grid localization.
//
// Every user-visible string the grid renders is sourced from `GridLabels`
// (English defaults below). Wrappers pass a resolved `GridLabels` instance
// down to their filter popup / body components, so a user only has to
// override the labels they care about via the `labels` prop/input.

import type {
  DateFilterOperator,
  NumberFilterOperator,
  TextFilterOperator,
} from "./types";

/** Labels for the filter operator dropdowns, keyed by semantic meaning. */
export interface GridFilterOperatorLabels {
  /** Text operator: contains */
  contains: string;
  /** Text operator: does not contain */
  notContains: string;
  /** Text operator: starts with */
  startsWith: string;
  /** Text operator: ends with */
  endsWith: string;
  /** Shared "equals" (= for number/date, equals for text) */
  equals: string;
  /** Shared "does not equal" (!= / notEquals) */
  notEquals: string;
  /** Number/date operator: greater than */
  greaterThan: string;
  /** Number/date operator: less than */
  lessThan: string;
  /** Number operator: greater than or equal */
  greaterThanOrEqual: string;
  /** Number operator: less than or equal */
  lessThanOrEqual: string;
  /** Number/date operator: between */
  between: string;
  /** Shared "is blank" operator */
  blank: string;
  /** Shared "is not blank" operator */
  notBlank: string;
}

/**
 * All user-visible grid labels. Strings containing `{token}` placeholders are
 * templates interpolated by {@link formatLabel}; the documented tokens are
 * `{column}`, `{count}`, and `{message}`.
 */
export interface GridLabels {
  /** Filter popup title template. Token: `{column}`. */
  filterTitle: string;
  /** Combination toggle: AND */
  and: string;
  /** Combination toggle: OR */
  or: string;
  /** Filter value input placeholder */
  valuePlaceholder: string;
  /** "between" second-input separator */
  betweenSeparator: string;
  /** "+ Add condition" button */
  addCondition: string;
  /** Remove-condition button glyph */
  removeCondition: string;
  /** "+ Add group" button */
  addGroup: string;
  /** Remove-group button glyph */
  removeGroup: string;
  /** Clear button */
  clear: string;
  /** Apply button */
  apply: string;
  /** Values mode toggle */
  valuesMode: string;
  /** Condition mode toggle */
  conditionMode: string;
  /** Values-mode search input placeholder */
  searchPlaceholder: string;
  /** Select all button */
  selectAll: string;
  /** Deselect all button */
  deselectAll: string;
  /** "(Blanks)" checkbox label */
  blanks: string;
  /** Too-many-values message template. Token: `{count}`. */
  tooManyValues: string;
  /** Empty grid message */
  emptyState: string;
  /** Error message prefix template. Token: `{message}`. */
  errorPrefix: string;
  /** Filter operator labels */
  operators: GridFilterOperatorLabels;
}

/**
 * Consumer overrides for grid labels. Every top-level label and every nested
 * operator label can be changed independently.
 */
export type GridLabelOverrides = Omit<Partial<GridLabels>, "operators"> & {
  operators?: Partial<GridFilterOperatorLabels>;
};

/** English defaults for every grid label. */
export const defaultGridLabels: GridLabels = {
  filterTitle: "Filter: {column}",
  and: "AND",
  or: "OR",
  valuePlaceholder: "Value",
  betweenSeparator: "to",
  addCondition: "+ Add condition",
  removeCondition: "\u00d7",
  addGroup: "+ Add group",
  removeGroup: "\u00d7",
  clear: "Clear",
  apply: "Apply",
  valuesMode: "Values",
  conditionMode: "Condition",
  searchPlaceholder: "Search...",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  blanks: "(Blanks)",
  tooManyValues:
    "Too many unique values ({count}). Use conditions to filter.",
  emptyState: "No data to display",
  errorPrefix: "Error: {message}",
  operators: {
    contains: "Contains",
    notContains: "Does not contain",
    startsWith: "Starts with",
    endsWith: "Ends with",
    equals: "Equals",
    notEquals: "Does not equal",
    greaterThan: "Greater than",
    lessThan: "Less than",
    greaterThanOrEqual: "Greater than or equal",
    lessThanOrEqual: "Less than or equal",
    between: "Between",
    blank: "Is blank",
    notBlank: "Is not blank",
  },
};

/**
 * Merge a partial label set over the English defaults, producing a complete
 * `GridLabels`. Top-level keys are shallow-merged and `operators` is merged
 * one level deep; the defaults are never mutated.
 */
export const resolveGridLabels = (
  overrides?: GridLabelOverrides,
): GridLabels => ({
  ...defaultGridLabels,
  ...overrides,
  operators: {
    ...defaultGridLabels.operators,
    ...overrides?.operators,
  },
});

/**
 * Interpolate `{token}` placeholders in a label template. Unknown tokens are
 * left untouched and missing params are skipped, so this never throws.
 */
export const formatLabel = (
  template: string,
  params: Record<string, string | number> = {},
): string =>
  template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = params[token];
    return value !== undefined ? String(value) : match;
  });

/** A single operator option rendered in a filter dropdown. */
export interface FilterOperatorOption<TOperator extends string = string> {
  value: TOperator;
  label: string;
}

/** Text filter operators in display order. */
export const getTextOperatorOptions = (
  labels: GridLabels,
): FilterOperatorOption<TextFilterOperator>[] => {
  const op = labels.operators;
  return [
    { value: "contains", label: op.contains },
    { value: "notContains", label: op.notContains },
    { value: "equals", label: op.equals },
    { value: "notEquals", label: op.notEquals },
    { value: "startsWith", label: op.startsWith },
    { value: "endsWith", label: op.endsWith },
    { value: "blank", label: op.blank },
    { value: "notBlank", label: op.notBlank },
  ];
};

/** Number filter operators in display order. */
export const getNumberOperatorOptions = (
  labels: GridLabels,
): FilterOperatorOption<NumberFilterOperator>[] => {
  const op = labels.operators;
  return [
    { value: "=", label: op.equals },
    { value: "!=", label: op.notEquals },
    { value: ">", label: op.greaterThan },
    { value: "<", label: op.lessThan },
    { value: ">=", label: op.greaterThanOrEqual },
    { value: "<=", label: op.lessThanOrEqual },
    { value: "between", label: op.between },
    { value: "blank", label: op.blank },
    { value: "notBlank", label: op.notBlank },
  ];
};

/** Date filter operators in display order. */
export const getDateOperatorOptions = (
  labels: GridLabels,
): FilterOperatorOption<DateFilterOperator>[] => {
  const op = labels.operators;
  return [
    { value: "=", label: op.equals },
    { value: "!=", label: op.notEquals },
    { value: ">", label: op.greaterThan },
    { value: "<", label: op.lessThan },
    { value: "between", label: op.between },
    { value: "blank", label: op.blank },
    { value: "notBlank", label: op.notBlank },
  ];
};
