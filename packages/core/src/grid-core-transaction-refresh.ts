// packages/core/src/grid-core-transaction-refresh.ts
// What a transaction result lets the grid skip (PRD 015 D2): a batch of
// updates needs no query, since the records already hold the new values.

import type { HierarchyRecordChange, RowId } from "./types";
import type { TransactionChange, TransactionResult } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import type { InstructionBatcher } from "./managers";
import type { SlotPoolManager } from "./slot-pool";
import type { RecordWrites } from "./grid-core-record-writes";

type UpdateChange = Extract<TransactionChange, { kind: "update" }>;

export type TransactionRefreshPlan =
  | { kind: "full" }
  | { kind: "slots"; rowIds: ReadonlySet<RowId> }
  | { kind: "records"; changes: readonly HierarchyRecordChange[] };

/** The batch's updates, or null when it holds anything else or says nothing. */
const updatesOf = (result: TransactionResult | undefined): readonly UpdateChange[] | null => {
  const changes = result?.changes;
  if (changes === undefined) return null;
  const updates: UpdateChange[] = [];
  for (const change of changes) {
    if (change.kind !== "update") return null;
    updates.push(change);
  }
  return updates;
};

const planHierarchy = <TData>(updates: readonly UpdateChange[], rowData: RowDataManager<TData>): TransactionRefreshPlan => {
  const hierarchy = rowData.getHierarchy();
  if (hierarchy?.recordsChanged === undefined) return { kind: "full" };
  const changes: HierarchyRecordChange[] = [];
  for (const update of updates) {
    const viewRow = rowData.findViewIndexById(update.rowId);
    // A record the view does not show (collapsed away, or gone) needs the full rebuild.
    if (viewRow < 0) return { kind: "full" };
    for (const field of update.fields) changes.push({ viewRow, field });
  }
  return { kind: "records", changes };
};

export const planTransactionRefresh = <TData>(
  result: TransactionResult | undefined,
  rowData: RowDataManager<TData>,
): TransactionRefreshPlan => {
  const updates = updatesOf(result);
  if (updates === null) return { kind: "full" };
  if (rowData.isWritable() === false || rowData.isPaginatedLoading() || rowData.hasStableIdentity() === false) {
    return { kind: "full" };
  }
  if (rowData.getHierarchy() !== null) return planHierarchy(updates, rowData);
  return { kind: "slots", rowIds: new Set(updates.map((update) => update.rowId)) };
};

export interface TransactionRefreshDeps<TData> {
  rowData: RowDataManager<TData>;
  slotPool: SlotPoolManager;
  batcher: InstructionBatcher;
  recordWrites: RecordWrites;
  reload: () => Promise<void>;
}

/** Redraws the mounted slots whose rows are in `rowIds`, as one batch. */
const refreshMountedRows = <TData>(rowIds: ReadonlySet<RowId>, deps: TransactionRefreshDeps<TData>): void => {
  deps.batcher.start();
  try {
    for (const slot of deps.slotPool.getSlots().values()) {
      const rowId = deps.rowData.getRowId(slot.rowIndex);
      if (rowId !== undefined && rowIds.has(rowId)) deps.slotPool.updateSlot(slot.rowIndex);
    }
  } finally {
    deps.batcher.flush();
  }
};

/** Runs the plan: a full reload, the hierarchy report, or the redraw of the changed mounted rows. */
export const applyTransactionRefresh = async <TData>(
  result: TransactionResult | undefined,
  deps: TransactionRefreshDeps<TData>,
): Promise<void> => {
  const plan = planTransactionRefresh(result, deps.rowData);
  if (plan.kind === "full") {
    await deps.reload();
    return;
  }
  if (plan.kind === "records") {
    deps.recordWrites.reportRecords(plan.changes);
    return;
  }
  refreshMountedRows(plan.rowIds, deps);
};
