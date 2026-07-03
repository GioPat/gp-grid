// Client-side sort/filter for Smart.Grid's virtualDataSource.
//
// In virtual-data mode the grid only ever asks the wrapper for the visible
// window, so it never sorts or filters the dataset itself — the application owns
// that. Smart.Grid does not surface the active criteria through the callback's
// `details` (they arrive as null entries), so the benchmark tracks them from its
// own sort()/filter() calls and applies them here over the full in-memory array.

import type { BenchmarkRow } from "../../../src/data/generate-data";
import {
  processRows,
  type FilterRule,
} from "../../../src/data/row-processing";
import type { FilterCondition, SortRule } from "../../../src/data/types";

export type SortState = SortRule[];

export type FilterState = Map<keyof BenchmarkRow, FilterCondition>;

// Apply the active filters then the active sort, returning a new array (or the
// input untouched when neither is active, to avoid a needless copy at 1M rows).
export const processView = (
  data: BenchmarkRow[],
  filters: FilterState,
  sort: SortState,
): BenchmarkRow[] => {
  const filterRules: FilterRule[] = Array.from(filters.entries()).map(
    ([field, condition]) => ({ field, condition }),
  );

  return processRows(data, filterRules, sort);
};
