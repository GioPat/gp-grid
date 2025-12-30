// packages/core/src/data-source/filtering.ts

import type {
  CellValue,
  FilterModel,
  ColumnFilterModel,
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  FilterCondition,
} from "../types";

// =============================================================================
// Filter Application
// =============================================================================

/**
 * Apply filters to data array
 */
export function applyFilters<TData>(
  data: TData[],
  filterModel: FilterModel | Record<string, string>,
  getFieldValue: (row: TData, field: string) => CellValue,
): TData[] {
  const filterEntries = Object.entries(filterModel).filter(
    ([, filter]) => {
      // Handle both old string format and new ColumnFilterModel format
      if (typeof filter === "string") {
        return filter.trim() !== "";
      }
      return filter.conditions && filter.conditions.length > 0;
    },
  );

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

// =============================================================================
// Column Filter Evaluation
// =============================================================================

/**
 * Evaluate a column filter against a cell value
 */
export function evaluateColumnFilter(
  cellValue: CellValue,
  filter: ColumnFilterModel,
): boolean {
  if (filter.conditions.length === 0) return true;

  const results = filter.conditions.map((condition) =>
    evaluateCondition(cellValue, condition),
  );

  if (filter.combination === "and") {
    return results.every((r) => r);
  } else {
    return results.some((r) => r);
  }
}

/**
 * Evaluate a single filter condition
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
// Text Filter Conditions
// =============================================================================

/**
 * Evaluate a text filter condition
 */
export function evaluateTextCondition(
  cellValue: CellValue,
  condition: TextFilterCondition,
): boolean {
  const isBlank = cellValue == null || cellValue === "" || (Array.isArray(cellValue) && cellValue.length === 0);

  // Handle selectedValues (checkbox-style filtering)
  if (condition.selectedValues && condition.selectedValues.size > 0) {
    const includesBlank = condition.includeBlank === true && isBlank;

    // Handle array values (e.g., tags column) - convert to sorted string for comparison
    if (Array.isArray(cellValue)) {
      const sortedArray = [...cellValue].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
      );
      const arrayStr = sortedArray.join(', ');
      return condition.selectedValues.has(arrayStr) || includesBlank;
    }

    const cellStr = String(cellValue ?? "");
    return condition.selectedValues.has(cellStr) || includesBlank;
  }

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
 * Evaluate a number filter condition
 */
export function evaluateNumberCondition(
  cellValue: CellValue,
  condition: NumberFilterCondition,
): boolean {
  const isBlank = cellValue == null || cellValue === "";

  if (condition.operator === "blank") return isBlank;
  if (condition.operator === "notBlank") return !isBlank;

  if (isBlank) return false;

  const numValue = Number(cellValue);
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
 * Check if two dates are on the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

/**
 * Evaluate a date filter condition
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
