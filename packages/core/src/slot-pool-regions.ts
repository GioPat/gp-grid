// packages/core/src/slot-pool-regions.ts
// C7 region helpers of the slot plan: a row's region, the rows to mount and
// the region fields an instruction carries.

import type { HierarchyRow } from "./types";
import type { RowRegion } from "./types/geometry";
import type { RowRegionLayout } from "./geometry";
import type { SlotPlanInput } from "./slot-pool-plan";

export const regionOfRow = (rowIndex: number, regions: RowRegionLayout): RowRegion =>
  rowIndex < regions.frozenCount ? "frozen" : "suffix";

/** Only the non-default fields: the flat instruction payload stays exact. */
export const slotRegionFields = (region: RowRegion, loading: boolean, row?: HierarchyRow) => {
  const fields: { region?: RowRegion; loading?: boolean; row?: HierarchyRow } = {};
  if (region === "frozen") fields.region = region;
  if (loading) fields.loading = loading;
  if (row) fields.row = row;
  return fields;
};

/** Frozen prefix plus the overscanned suffix window, ascending (C7). */
export const requiredRows = (input: Pick<SlotPlanInput, "window" | "rowCount" | "regions">): Set<number> => {
  const { window, rowCount, regions } = input;
  const frozenCount = Math.min(Math.max(regions.frozenCount, 0), rowCount);
  const rows = new Set<number>();
  for (let row = 0; row < frozenCount; row++) {
    rows.add(row);
  }
  for (let row = Math.max(window.start, frozenCount); row < window.end && row < rowCount; row++) {
    rows.add(row);
  }
  return rows;
};
