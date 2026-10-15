// packages/core/src/pivot/pivot-order.ts
// The order of the row groups under the request's sort (PRD 012 D5).

import type { RowGroupDimension, SortModel } from "../types";
import { PIVOT_LABEL_COLUMN_ID, decodePivotColumnId } from "../hierarchy/pivot-ids";

export interface PivotSortSpec {
  readonly rows: readonly RowGroupDimension[];
  readonly measures: readonly { readonly field: string }[];
  readonly rowTotals: boolean;
}

/** The sort `buildGroupTree` reads, and the column whose values order every level, if any. */
export interface PivotOrder {
  readonly sort: SortModel[];
  readonly valueColumn?: string;
}

const KEYS_ASCENDING: PivotOrder = { sort: [] };

const isValueColumn = (spec: PivotSortSpec, colId: string): boolean => {
  const decoded = decodePivotColumnId(colId);
  if (decoded === undefined || spec.measures.some((measure) => measure.field === decoded.measure) === false) return false;
  return decoded.path.length > 0 || spec.rowTotals;
};

/**
 * The first sorted entry naming the label column orders every level by key in its direction;
 * one naming a generated or row-total column orders every level by that column's values,
 * since the source's `fieldOf` is identity and the column id is the measure field `buildGroupTree` sees.
 */
export const resolvePivotOrder = (spec: PivotSortSpec, sort: readonly SortModel[] = []): PivotOrder => {
  for (const entry of sort) {
    if (entry.direction === null) continue;
    if (entry.colId === PIVOT_LABEL_COLUMN_ID) {
      return { sort: spec.rows.map((dimension) => ({ colId: dimension.field, direction: entry.direction })) };
    }
    if (isValueColumn(spec, entry.colId)) return { sort: [entry], valueColumn: entry.colId };
  }
  return KEYS_ASCENDING;
};
