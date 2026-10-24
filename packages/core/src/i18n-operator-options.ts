// packages/core/src/i18n-operator-options.ts
// Filter operator options in display order, labelled from `GridLabels`.

import type {
  DateFilterOperator,
  NumberFilterOperator,
  TextFilterOperator,
} from "./types";
import type { GridLabels } from "./i18n";

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
