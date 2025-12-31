// packages/core/src/indexed-data-store/filtering.ts

import type { CellValue, FilterModel, ColumnFilterModel, Row } from "../types";

/**
 * Text filter condition type
 */
export interface TextCondition {
  type: "text";
  operator: string;
  value?: string;
  selectedValues?: Set<string>;
  includeBlank?: boolean;
}

/**
 * Number filter condition type
 */
export interface NumberCondition {
  type: "number";
  operator: string;
  value?: number;
  valueTo?: number;
}

/**
 * Date filter condition type
 */
export interface DateCondition {
  type: "date";
  operator: string;
  value?: Date | string;
  valueTo?: Date | string;
}

/**
 * Check if two dates are on the same day.
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Evaluate a text filter condition against a cell value.
 */
export function evaluateTextCondition(
  cellValue: CellValue,
  condition: TextCondition
): boolean {
  const isBlank =
    cellValue == null ||
    cellValue === "" ||
    (Array.isArray(cellValue) && cellValue.length === 0);

  // Handle set-based selection (distinct values)
  if (condition.selectedValues && condition.selectedValues.size > 0) {
    const includesBlank = condition.includeBlank === true && isBlank;

    // Handle array values (e.g., tags column) - convert to sorted string for comparison
    if (Array.isArray(cellValue)) {
      const sortedArray = [...cellValue].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
      const arrayStr = sortedArray.join(", ");
      return condition.selectedValues.has(arrayStr) || includesBlank;
    }

    const cellStr = String(cellValue ?? "");
    return condition.selectedValues.has(cellStr) || includesBlank;
  }

  // Handle operator-based conditions
  const strValue = String(cellValue ?? "").toLowerCase();
  const filterValue = String(condition.value ?? "").toLowerCase();

  switch (condition.operator) {
    case "contains":
      return strValue.includes(filterValue);
    case "notContains":
      return !strValue.includes(filterValue);
    case "equals":
      return strValue === filterValue;
    case "notEquals":
      return strValue !== filterValue;
    case "startsWith":
      return strValue.startsWith(filterValue);
    case "endsWith":
      return strValue.endsWith(filterValue);
    case "blank":
      return isBlank;
    case "notBlank":
      return !isBlank;
    default:
      return true;
  }
}

/**
 * Evaluate a number filter condition against a cell value.
 */
export function evaluateNumberCondition(
  cellValue: CellValue,
  condition: NumberCondition
): boolean {
  const isBlank = cellValue == null || cellValue === "";
  if (condition.operator === "blank") return isBlank;
  if (condition.operator === "notBlank") return !isBlank;
  if (isBlank) return false;

  const numValue =
    typeof cellValue === "number" ? cellValue : parseFloat(String(cellValue));
  if (isNaN(numValue)) return false;

  const filterValue = condition.value ?? 0;
  const filterTo = condition.valueTo ?? 0;

  switch (condition.operator) {
    case "=":
      return numValue === filterValue;
    case "!=":
      return numValue !== filterValue;
    case ">":
      return numValue > filterValue;
    case "<":
      return numValue < filterValue;
    case ">=":
      return numValue >= filterValue;
    case "<=":
      return numValue <= filterValue;
    case "between":
      return numValue >= filterValue && numValue <= filterTo;
    default:
      return true;
  }
}

/**
 * Evaluate a date filter condition against a cell value.
 */
export function evaluateDateCondition(
  cellValue: CellValue,
  condition: DateCondition
): boolean {
  const isBlank = cellValue == null || cellValue === "";
  if (condition.operator === "blank") return isBlank;
  if (condition.operator === "notBlank") return !isBlank;
  if (isBlank) return false;

  const cellDate =
    cellValue instanceof Date ? cellValue : new Date(String(cellValue));
  if (isNaN(cellDate.getTime())) return false;

  const filterDate = condition.value
    ? condition.value instanceof Date
      ? condition.value
      : new Date(condition.value)
    : new Date();
  const filterDateTo = condition.valueTo
    ? condition.valueTo instanceof Date
      ? condition.valueTo
      : new Date(condition.valueTo)
    : new Date();

  switch (condition.operator) {
    case "=":
      return isSameDay(cellDate, filterDate);
    case "!=":
      return !isSameDay(cellDate, filterDate);
    case ">":
      return cellDate > filterDate;
    case "<":
      return cellDate < filterDate;
    case "between":
      return cellDate >= filterDate && cellDate <= filterDateTo;
    default:
      return true;
  }
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  cellValue: CellValue,
  condition: TextCondition | NumberCondition | DateCondition
): boolean {
  switch (condition.type) {
    case "text":
      return evaluateTextCondition(cellValue, condition as TextCondition);
    case "number":
      return evaluateNumberCondition(cellValue, condition as NumberCondition);
    case "date":
      return evaluateDateCondition(cellValue, condition as DateCondition);
    default:
      return true;
  }
}

/**
 * Evaluate a column filter model against a cell value.
 * Uses left-to-right evaluation with per-condition operators.
 */
export function evaluateColumnFilter(
  cellValue: CellValue,
  filter: ColumnFilterModel
): boolean {
  if (!filter.conditions || !filter.conditions.length) return true;

  const firstCondition = filter.conditions[0];
  if (!firstCondition) return true;

  // Evaluate first condition
  let result = evaluateCondition(cellValue, firstCondition);

  // Iterate through remaining conditions with per-condition operators
  for (let i = 1; i < filter.conditions.length; i++) {
    const prevCondition = filter.conditions[i - 1]!;
    const currentCondition = filter.conditions[i]!;
    // Use nextOperator from previous condition, fallback to global combination
    const operator = prevCondition.nextOperator ?? filter.combination;
    const conditionResult = evaluateCondition(cellValue, currentCondition);

    if (operator === "and") {
      result = result && conditionResult;
    } else {
      result = result || conditionResult;
    }
  }

  return result;
}

/**
 * Check if a row passes all filters in a filter model.
 */
export function rowPassesFilter<TData extends Row>(
  row: TData,
  filterModel: FilterModel,
  getFieldValue: (row: TData, field: string) => CellValue
): boolean {
  const filterEntries = Object.entries(filterModel).filter(
    ([, value]) => value != null
  );

  if (filterEntries.length === 0) {
    return true;
  }

  for (const [field, filter] of filterEntries) {
    const cellValue = getFieldValue(row, field);

    // Handle old string format (backwards compatibility)
    if (typeof filter === "string") {
      const strValue = String(cellValue ?? "").toLowerCase();
      if (!strValue.includes(filter.toLowerCase())) {
        return false;
      }
      continue;
    }

    // Handle new ColumnFilterModel format
    if (!evaluateColumnFilter(cellValue, filter)) {
      return false;
    }
  }

  return true;
}
