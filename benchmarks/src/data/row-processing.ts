import type { BenchmarkRow } from "./generate-data";
import type { FilterCondition, SortRule } from "./types";

export interface FilterRule {
  field: keyof BenchmarkRow;
  condition: FilterCondition;
}

export const waitForBrowserIdle = (): Promise<void> => {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
};

export const matchesCondition = (
  value: BenchmarkRow[keyof BenchmarkRow],
  condition: FilterCondition,
): boolean => {
  switch (condition.type) {
    case "contains":
      return String(value)
        .toLowerCase()
        .includes(String(condition.value).toLowerCase());
    case "equals":
      return String(value).toLowerCase() === String(condition.value).toLowerCase();
    case "greaterThan":
      return Number(value) > Number(condition.value);
    case "lessThan":
      return Number(value) < Number(condition.value);
    case "between":
      return (
        Array.isArray(condition.value) &&
        Number(value) >= condition.value[0] &&
        Number(value) <= condition.value[1]
      );
  }
};

export const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  return String(a).localeCompare(String(b));
};

export const compareRowsBySortRules = (
  a: BenchmarkRow,
  b: BenchmarkRow,
  rules: SortRule[],
): number => {
  for (const rule of rules) {
    const field = rule.field as keyof BenchmarkRow;
    const direction = rule.direction === "asc" ? 1 : -1;
    const result = compareValues(a[field], b[field]);

    if (result !== 0) {
      return result * direction;
    }
  }

  return 0;
};

export const rowMatchesFilters = (
  row: BenchmarkRow,
  filters: FilterRule[],
): boolean => {
  for (const filter of filters) {
    if (matchesCondition(row[filter.field], filter.condition) === false) {
      return false;
    }
  }

  return true;
};

export const filterRows = (
  rows: BenchmarkRow[],
  filters: FilterRule[],
): BenchmarkRow[] => {
  if (filters.length === 0) {
    return rows;
  }

  return rows.filter((row) => rowMatchesFilters(row, filters));
};

export const sortRows = (
  rows: BenchmarkRow[],
  rules: SortRule[],
): BenchmarkRow[] => {
  if (rules.length === 0) {
    return rows;
  }

  return [...rows].sort((a, b) => compareRowsBySortRules(a, b, rules));
};

export const processRows = (
  rows: BenchmarkRow[],
  filters: FilterRule[],
  sortRules: SortRule[],
): BenchmarkRow[] => {
  return sortRows(filterRows(rows, filters), sortRules);
};

export const getExpectedRowIds = (
  rows: BenchmarkRow[],
  filters: FilterRule[],
  sortRules: SortRule[],
  count: number,
): number[] => {
  return processRows(rows, filters, sortRules)
    .slice(0, count)
    .map((row) => row.id);
};

export const normalizeDateValue = (value: Date | string): Date => {
  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
};
