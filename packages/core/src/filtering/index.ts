// packages/core/src/filtering/index.ts
// Shared filtering logic used by both data-source and indexed-data-store

import type {
  CellValue,
  FilterCondition,
  TextFilterCondition,
  TextFilterOperator,
  NumberFilterCondition,
  NumberFilterOperator,
  DateFilterCondition,
  DateFilterOperator,
  ColumnFilterModel,
  FilterModel,
} from "../types";
import { formatCellValue } from "../utils/format-helpers";
import { isBlankCellValue, rawValueKey } from "./distinct-entries";

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

// Blank detection is shared with the popup helpers (`isBlankCellValue` in
// distinct-entries.ts) so the "(Blanks)" checkbox and the filter evaluation
// always agree on what counts as blank.

// =============================================================================
// Text Filter Conditions
// =============================================================================

const TEXT_OPERATORS: Record<
  TextFilterOperator,
  (s: string, f: string, isBlank: boolean) => boolean
> = {
  contains: (s, f) => s.includes(f),
  notContains: (s, f) => !s.includes(f),
  equals: (s, f) => s === f,
  notEquals: (s, f) => s !== f,
  startsWith: (s, f) => s.startsWith(f),
  endsWith: (s, f) => s.endsWith(f),
  blank: (_s, _f, b) => b,
  notBlank: (_s, _f, b) => !b,
};

/**
 * Keyed form of a values-mode `selectedValues` set, cached per Set instance.
 * Values-mode evaluation runs once per row over potentially millions of rows,
 * so the selected set is keyed once instead of per row. Filter models are
 * treated as immutable (replace the Set to change the selection); the size
 * guard additionally rebuilds the keys if a consumer grew or shrank the Set
 * in place.
 */
const selectedKeysCache = new WeakMap<
  ReadonlySet<CellValue>,
  { size: number; keys: Set<string> }
>();

const getSelectedValueKeys = (
  selectedValues: ReadonlySet<CellValue>,
): Set<string> => {
  const cached = selectedKeysCache.get(selectedValues);
  if (cached?.size === selectedValues.size) {
    return cached.keys;
  }
  const keys = new Set<string>();
  for (const value of selectedValues) keys.add(rawValueKey(value));
  selectedKeysCache.set(selectedValues, { size: selectedValues.size, keys });
  return keys;
};

/**
 * Evaluate a text filter condition against a cell value.
 *
 * Values mode (`selectedValues`) compares RAW values via {@link rawValueKey};
 * the formatter is never consulted, so the filter model matches what a
 * server-side data source receives. The `formatter` only applies to free-text
 * condition operators (contains, equals, ...), where the user types the text
 * they see on screen.
 */
export function evaluateTextCondition(
  cellValue: CellValue,
  condition: TextFilterCondition,
  formatter?: (v: CellValue) => string,
): boolean {
  const isBlank = isBlankCellValue(cellValue);

  // Values mode (checkbox-style filtering): raw-value membership. The mere
  // presence of the set selects values mode — an empty set is a valid
  // selection (e.g. only "(Blanks)" ticked) and must not fall through to the
  // free-text operator, which would match everything for `contains`.
  if (condition.selectedValues !== undefined) {
    if (isBlank) return condition.includeBlank === true;
    const selectedKeys = getSelectedValueKeys(condition.selectedValues);
    return selectedKeys.has(rawValueKey(cellValue));
  }

  const strValue = formatCellValue(cellValue, formatter).toLowerCase();
  const filterValue = String(condition.value ?? "").toLowerCase();
  return TEXT_OPERATORS[condition.operator](strValue, filterValue, isBlank);
}

// =============================================================================
// Number Filter Conditions
// =============================================================================

const NUMBER_OPERATORS: Record<
  Exclude<NumberFilterOperator, "blank" | "notBlank">,
  (v: number, f: number, fTo: number) => boolean
> = {
  "=": (v, f) => v === f,
  "!=": (v, f) => v !== f,
  ">": (v, f) => v > f,
  "<": (v, f) => v < f,
  ">=": (v, f) => v >= f,
  "<=": (v, f) => v <= f,
  between: (v, f, fTo) => v >= f && v <= fTo,
};

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

  const numValue = typeof cellValue === "number" ? cellValue : Number(cellValue);
  if (Number.isNaN(numValue)) return false;

  const filterValue = condition.value ?? 0;
  const filterValueTo = condition.valueTo ?? 0;
  return NUMBER_OPERATORS[condition.operator](numValue, filterValue, filterValueTo);
}

// =============================================================================
// Date Filter Conditions
// =============================================================================

const DATE_OPERATORS: Record<
  Exclude<DateFilterOperator, "blank" | "notBlank">,
  (d: Date, f: Date, fTo: Date) => boolean
> = {
  "=": (d, f) => isSameDay(d, f),
  "!=": (d, f) => !isSameDay(d, f),
  ">": (d, f) => d.getTime() > f.getTime(),
  "<": (d, f) => d.getTime() < f.getTime(),
  between: (d, f, fTo) => {
    const t = d.getTime();
    return t >= f.getTime() && t <= fTo.getTime();
  },
};

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

  const dateValue = cellValue instanceof Date
    ? cellValue
    : new Date(formatCellValue(cellValue));
  if (Number.isNaN(dateValue.getTime())) return false;

  const filterDate = condition.value instanceof Date
    ? condition.value
    : new Date(String(condition.value ?? ""));
  const filterDateTo = condition.valueTo instanceof Date
    ? condition.valueTo
    : new Date(String(condition.valueTo ?? ""));

  return DATE_OPERATORS[condition.operator](dateValue, filterDate, filterDateTo);
}

// =============================================================================
// Condition Evaluation
// =============================================================================

/**
 * Evaluate a single filter condition against a cell value.
 * Text conditions honor `formatter` so comparisons match the displayed value.
 */
export function evaluateCondition(
  cellValue: CellValue,
  condition: FilterCondition,
  formatter?: (v: CellValue) => string,
): boolean {
  switch (condition.type) {
    case "text":
      return evaluateTextCondition(cellValue, condition, formatter);
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
 * When `formatter` is provided, text conditions compare against the formatted
 * display value rather than the raw string.
 */
export function evaluateColumnFilter(
  cellValue: CellValue,
  filter: ColumnFilterModel,
  formatter?: (v: CellValue) => string,
): boolean {
  if (!filter.conditions || filter.conditions.length === 0) return true;

  const firstCondition = filter.conditions[0];
  if (!firstCondition) return true;

  // Evaluate first condition
  let result = evaluateCondition(cellValue, firstCondition, formatter);

  // Iterate through remaining conditions with per-condition operators
  for (let i = 1; i < filter.conditions.length; i++) {
    const prevCondition = filter.conditions[i - 1]!;
    const currentCondition = filter.conditions[i]!;
    // Use nextOperator from previous condition, fallback to global combination
    const operator = prevCondition.nextOperator ?? filter.combination;
    const conditionResult = evaluateCondition(cellValue, currentCondition, formatter);

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
 * `getValueFormatter` — when provided — lets free-text condition operators
 * compare the formatted (displayed) cell value instead of the raw string.
 * Values-mode `selectedValues` always compare raw values and ignore it.
 */
export function rowPassesFilter<TData>(
  row: TData,
  filterModel: FilterModel,
  getFieldValue: (row: TData, field: string) => CellValue,
  getValueFormatter?: (field: string) => ((v: CellValue) => string) | undefined,
): boolean {
  const filterEntries = Object.entries(filterModel).filter(
    ([, value]) => value != null,
  );

  if (filterEntries.length === 0) {
    return true;
  }

  for (const [field, filter] of filterEntries) {
    const cellValue = getFieldValue(row, field);
    const formatter = getValueFormatter?.(field);

    if (!evaluateColumnFilter(cellValue, filter, formatter)) {
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
 * `getValueFormatter` — when provided — lets free-text condition operators
 * compare the formatted (displayed) cell value instead of the raw string.
 * Values-mode `selectedValues` always compare raw values and ignore it.
 */
export function applyFilters<TData>(
  data: TData[],
  filterModel: FilterModel | Record<string, string>,
  getFieldValue: (row: TData, field: string) => CellValue,
  getValueFormatter?: (field: string) => ((v: CellValue) => string) | undefined,
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
      const formatter = getValueFormatter?.(field);

      // Handle old string format (backwards compatibility)
      if (typeof filter === "string") {
        const strValue = formatCellValue(cellValue, formatter).toLowerCase();
        if (!strValue.includes(filter.toLowerCase())) {
          return false;
        }
        continue;
      }

      // Handle new ColumnFilterModel format
      if (!evaluateColumnFilter(cellValue, filter, formatter)) {
        return false;
      }
    }
    return true;
  });
}
