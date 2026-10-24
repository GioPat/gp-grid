// packages/core/src/managers/row-locate.ts
// Row identity lookups over a range of view rows, shared by the row store.

import type { HierarchicalRowAccess, RowId } from "../types";
import type { AxisBounds } from "../types/geometry";

export const rangeStart = (range?: AxisBounds): number => Math.max(0, Math.trunc(range?.start ?? 0));

export const rangeEnd = (range: AxisBounds | undefined, extent: number): number =>
  Math.min(Math.trunc(range?.end ?? extent), extent);

/** Asks the hierarchy for each id; a hidden row answers its ancestor, which is not a match. */
export const locateInHierarchy = (
  hierarchy: HierarchicalRowAccess<unknown>,
  ids: ReadonlySet<RowId>,
  range?: AxisBounds,
): Map<RowId, number> => {
  const found = new Map<RowId, number>();
  const first = rangeStart(range);
  const end = rangeEnd(range, hierarchy.rowCount);
  for (const id of ids) {
    const index = hierarchy.locate(id);
    if (index < first || index >= end || hierarchy.getRowId(index) !== id) continue;
    found.set(id, index);
  }
  return found;
};
