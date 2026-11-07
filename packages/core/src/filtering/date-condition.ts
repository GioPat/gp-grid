// packages/core/src/filtering/date-condition.ts

import type { CellValue, DateFilterCondition, DateFilterOperator } from "../types";
import { formatCellValue } from "../utils/format-helpers";
import { parseLocalDate, toDateSpan, type DateSpan } from "./date-values";

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

const matchesSpan = (date: Date, span: DateSpan): boolean => {
  if (span.point) return isSameDay(date, new Date(span.start));
  const time = date.getTime();
  return time >= span.start && time < span.end;
};

const DATE_OPERATORS: Record<
  Exclude<DateFilterOperator, "blank" | "notBlank">,
  (d: Date, f: DateSpan, fTo: DateSpan) => boolean
> = {
  "=": (d, f) => matchesSpan(d, f),
  "!=": (d, f) => !matchesSpan(d, f),
  ">": (d, f) => d.getTime() >= f.end,
  "<": (d, f) => d.getTime() < f.start,
  between: (d, f, fTo) => {
    const t = d.getTime();
    return t >= f.start && t < fTo.end;
  },
};

const toCellDate = (cellValue: CellValue): Date => {
  if (cellValue instanceof Date) return cellValue;
  if (typeof cellValue === "string") return parseLocalDate(cellValue);
  return new Date(formatCellValue(cellValue));
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

  const dateValue = toCellDate(cellValue);
  if (Number.isNaN(dateValue.getTime())) return false;

  const span = toDateSpan(condition.value);
  const spanTo = condition.operator === "between" ? toDateSpan(condition.valueTo) : span;
  if (span === null || spanTo === null) return false;

  return DATE_OPERATORS[condition.operator](dateValue, span, spanTo);
}
