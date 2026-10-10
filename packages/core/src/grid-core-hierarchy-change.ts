// packages/core/src/grid-core-hierarchy-change.ts
// The one applier for a change of the view rows. Expansion, a regroup and
// a transaction refresh under a hierarchy keep the anchor row and the active
// cell by identity across the change.

import type { RowId } from "./types";
import type { EditManager } from "./edit-manager";
import type { SelectionManager } from "./selection";
import type { RowDataManager } from "./managers/row-data-manager";
import type { RowAnchor } from "./geometry";
import {
  captureSizeAnchor,
  resyncAfterSizeChange,
  type SizeChangeDeps,
} from "./grid-core-size-change";

export interface HierarchyChangeDeps<TData> extends SizeChangeDeps<TData> {
  selection: SelectionManager;
  editManager: EditManager;
}

/** The anchor row and the active cell's row, by identity. */
export interface ViewRowsCapture {
  anchor: { id: RowId; intra: number } | null;
  active: { id: RowId; col: number } | null;
}

/** A hidden row answers its nearest visible ancestor; a flat grid only finds the row. */
const locateRow = <TData>(rowData: RowDataManager<TData>, id: RowId): number =>
  rowData.getHierarchy()?.locate(id) ?? rowData.findViewIndexById(id);

const captureAnchor = <TData>(deps: HierarchyChangeDeps<TData>): ViewRowsCapture["anchor"] => {
  const anchor = captureSizeAnchor(deps);
  if (anchor === null) return null;
  const id = deps.rowData.getRowId(anchor.index);
  return id === undefined ? null : { id, intra: anchor.intra };
};

const captureActive = <TData>(deps: HierarchyChangeDeps<TData>): ViewRowsCapture["active"] => {
  const cell = deps.selection.getActiveCell();
  if (cell === null) return null;
  const id = deps.rowData.getRowId(cell.row);
  return id === undefined ? null : { id, col: cell.col };
};

export const captureViewRows = <TData>(deps: HierarchyChangeDeps<TData>): ViewRowsCapture => ({
  anchor: captureAnchor(deps),
  active: captureActive(deps),
});

/** The intra-row offset survives only when the anchor row itself is still shown. */
const resolveAnchor = <TData>(
  rowData: RowDataManager<TData>,
  anchor: ViewRowsCapture["anchor"],
): RowAnchor | null => {
  if (anchor === null) return null;
  const index = locateRow(rowData, anchor.id);
  if (index < 0) return null;
  return { index, intra: rowData.getRowId(index) === anchor.id ? anchor.intra : 0 };
};

const restoreActive = <TData>(
  deps: HierarchyChangeDeps<TData>,
  active: ViewRowsCapture["active"],
): void => {
  const { selection } = deps;
  if (active === null) {
    if (selection.getSelectionRange()) selection.clearSelectionRange();
    return;
  }
  const row = locateRow(deps.rowData, active.id);
  if (row < 0) selection.clearSelection();
  else selection.setActiveCell(row, active.col);
};

/** Runs inside the caller's open batch, after the view rows changed. */
export const restoreViewRows = <TData>(
  deps: HierarchyChangeDeps<TData>,
  capture: ViewRowsCapture,
): void => {
  resyncAfterSizeChange(deps, resolveAnchor(deps.rowData, capture.anchor), "reconcile");
  restoreActive(deps, capture.active);
};

/** One batch: commit the edit, capture, change, then re-publish; false when nothing changed. */
export const applyViewRowsChange = <TData>(
  deps: HierarchyChangeDeps<TData>,
  change: () => boolean,
): boolean => {
  const { batcher, editManager } = deps;
  batcher.start();
  try {
    const edit = editManager.getState();
    if (edit) editManager.commit(edit.editId);
    const capture = captureViewRows(deps);
    if (change() === false) return false;
    const rowData = deps.rowData;
    rowData.bumpDataRevision();
    rowData.emitLoaded();
    restoreViewRows(deps, capture);
    return true;
  } finally {
    batcher.flush();
  }
};

/** A reload under a hierarchy keeps the anchor and the active row by identity. */
export const reloadViewRows = async <TData>(
  deps: HierarchyChangeDeps<TData>,
  reload: () => Promise<void>,
): Promise<void> => {
  const capture = captureViewRows(deps);
  await reload();
  deps.batcher.start();
  try {
    restoreViewRows(deps, capture);
  } finally {
    deps.batcher.flush();
  }
};
