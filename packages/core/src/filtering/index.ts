// packages/core/src/filtering/index.ts
// Shared filtering logic used by both data-source and indexed-data-store

import type {
  CellValue,
  FilterCondition,
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  ColumnFilterModel,
  FilterModel,
  Row,
} from "../types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if two dates are on the same day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if a cell value is considered blank.
 */
function isBlankValue(cellValue: CellValue): boolean {
  return (
    cellValue == null ||
    cellValue === "" ||
    (Array.isArray(cellValue) && cellValue.length === 0)
  );
}

// =============================================================================
// Text Filter Conditions
// =============================================================================

/**
 * Evaluate a text filter condition against a cell value.
 */
export function evaluateTextCondition(
  cellValue: CellValue,
  condition: TextFilterCondition,
): boolean {
  const isBlank = isBlankValue(cellValue);

  // Handle selectedValues (checkbox-style filtering)
  if (condition.selectedValues && condition.selectedValues.size > 0) {
    const includesBlank = condition.includeBlank === true && isBlank;

    // Handle array values (e.g., tags column) - convert to sorted string for comparison
    if (Array.isArray(cellValue)) {
      const sortedArray = [...cellValue].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
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

// =============================================================================
// Number Filter Conditions
// =============================================================================

/**
 * Evaluate a number filter condition against a cell value.
 */
export function evaluateNumberCondition(
  cellValue: CellValue,
  condition: NumberFilterCondition,
): boolean {
  const isBlank = cellValue == null || cellValue === "";

  if (condition.operator === "blank") return isBlank;
  if (condition.operator === "notBlank") return !isBlank;
  if (isBlank) return false;

  const numValue =
    typeof cellValue === "number" ? cellValue : Number(cellValue);
  if (isNaN(numValue)) return false;

  const filterValue = condition.value ?? 0;
  const filterValueTo = condition.valueTo ?? 0;

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
      return numValue >= filterValue && numValue <= filterValueTo;
    default:
      return true;
  }
}

// =============================================================================
// Date Filter Conditions
// =============================================================================

/**
 * Evaluate a date filter condition against a cell value.
 */
export function evaluateDateCondition(
  cellValue: CellValue,
  condition: DateFilterCondition,
): boolean {
  const isBlank = cellValue == null || cellValue === "";

  if (condition.operator === "blank") return isBlank;
  if (condition.operator === "notBlank") return !isBlank;
  if (isBlank) return false;

  const dateValue =
    cellValue instanceof Date ? cellValue : new Date(String(cellValue));
  if (isNaN(dateValue.getTime())) return false;

  const filterDate =
    condition.value instanceof Date
      ? condition.value
      : new Date(String(condition.value ?? ""));
  const filterDateTo =
    condition.valueTo instanceof Date
      ? condition.valueTo
      : new Date(String(condition.valueTo ?? ""));

  const dateTime = dateValue.getTime();
  const filterTime = filterDate.getTime();
  const filterTimeTo = filterDateTo.getTime();

  switch (condition.operator) {
    case "=":
      return isSameDay(dateValue, filterDate);
    case "!=":
      return !isSameDay(dateValue, filterDate);
    case ">":
      return dateTime > filterTime;
    case "<":
      return dateTime < filterTime;
    case "between":
      return dateTime >= filterTime && dateTime <= filterTimeTo;
    default:
      return true;
  }
}

// =============================================================================
// Condition Evaluation
// =============================================================================

/**
 * Evaluate a single filter condition against a cell value.
 */
export function evaluateCondition(
  cellValue: CellValue,
  condition: FilterCondition,
): boolean {
  switch (condition.type) {
    case "text":
      return evaluateTextCondition(cellValue, condition);
    case "number":
      return evaluateNumberCondition(cellValue, condition);
    case "date":
      return evaluateDateCondition(cellValue, condition);
    default:
      return true;
  }
}

// =============================================================================
// Column Filter Evaluation
// =============================================================================

/**
 * Evaluate a column filter model against a cell value.
 * Uses left-to-right evaluation with per-condition operators.
 */
export function evaluateColumnFilter(
  cellValue: CellValue,
  filter: ColumnFilterModel,
): boolean {
  if (!filter.conditions || filter.conditions.length === 0) return true;

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

// =============================================================================
// Row Filter Evaluation
// =============================================================================

/**
 * Check if a row passes all filters in a filter model.
 */
export function rowPassesFilter<TData extends Row>(
  row: TData,
  filterModel: FilterModel,
  getFieldValue: (row: TData, field: string) => CellValue,
): boolean {
  const filterEntries = Object.entries(filterModel).filter(
    ([, value]) => value != null,
  );

  if (filterEntries.length === 0) {
    return true;
  }

  for (const [field, filter] of filterEntries) {
    const cellValue = getFieldValue(row, field);

    if (!evaluateColumnFilter(cellValue, filter)) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Array Filter (for batch operations)
// =============================================================================

/**
 * Apply filters to a data array.
 * Supports both new ColumnFilterModel format and legacy string format.
 */
export function applyFilters<TData>(
  data: TData[],
  filterModel: FilterModel | Record<string, string>,
  getFieldValue: (row: TData, field: string) => CellValue,
): TData[] {
  const filterEntries = Object.entries(filterModel).filter(([, filter]) => {
    // Handle both old string format and new ColumnFilterModel format
    if (typeof filter === "string") {
      return filter.trim() !== "";
    }
    return filter.conditions && filter.conditions.length > 0;
  });

  if (filterEntries.length === 0) {
    return data;
  }

  return data.filter((row) => {
    // All column filters must pass (AND between columns)
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
  });
}
