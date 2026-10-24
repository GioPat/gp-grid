// packages/core/src/grid-core-column-targets.ts
// Everything addressed by a column index — the edit, the peek and the active
// cell — follows its column identity across a column change, or is dropped
// when the column is gone.

import type { ColumnModel } from "./column-model";
import type { SelectionManager } from "./selection";
import type { EditManager } from "./edit-manager";

/** Column identities of everything addressed by a column index. */
export interface ColumnTargets {
  edit: string | undefined;
  peek: string | undefined;
  active: string | undefined;
}

/** Managers an identity reconciliation reads and writes. */
export interface ColumnTargetDeps {
  columnModel: ColumnModel;
  selection: SelectionManager;
  editManager: EditManager;
}

export const captureColumnTargets = (deps: ColumnTargetDeps): ColumnTargets => {
  const edit = deps.editManager.getState();
  const peek = deps.editManager.getPeekState();
  const activeCell = deps.selection.getActiveCell();
  return {
    edit: edit ? deps.columnModel.idAt(edit.col) : undefined,
    peek: peek ? deps.columnModel.idAt(peek.col) : undefined,
    active: activeCell ? deps.columnModel.idAt(activeCell.col) : undefined,
  };
};

export const reconcileColumnTargets = (deps: ColumnTargetDeps, targets: ColumnTargets): void => {
  reconcileEditState(deps, targets.edit);
  reconcilePeekState(deps, targets.peek);
  reconcileActiveCell(deps, targets.active);
};

/** Keep the edited column mounted outside the center window while it is open. */
export interface EditRetentionDeps {
  columnModel: ColumnModel;
  editManager: EditManager;
  retainEditColumn: (columnId: string | null) => void;
}

export const syncEditRetention = (deps: EditRetentionDeps): void => {
  const edit = deps.editManager.getState();
  deps.retainEditColumn(edit === null ? null : deps.columnModel.idAt(edit.col) ?? null);
};

/** Cancel an edit whose column was removed, or follow it to its new index. */
const reconcileEditState = (
  deps: ColumnTargetDeps,
  previousColumnId: string | undefined,
): void => {
  const edit = deps.editManager.getState();
  if (edit === null) return;
  const nextIndex =
    previousColumnId === undefined ? -1 : deps.columnModel.indexOf(previousColumnId);
  if (nextIndex === -1) {
    deps.editManager.cancel();
    return;
  }
  deps.editManager.remapColumn(nextIndex);
};

const reconcilePeekState = (
  deps: ColumnTargetDeps,
  previousColumnId: string | undefined,
): void => {
  if (deps.editManager.getPeekState() === null) return;
  const nextIndex =
    previousColumnId === undefined ? -1 : deps.columnModel.indexOf(previousColumnId);
  if (nextIndex === -1) {
    deps.editManager.stopPeek();
    return;
  }
  deps.editManager.remapPeekColumn(nextIndex);
};

/** Follow the active cell's column identity to its new index, or clear it. */
const reconcileActiveCell = (
  deps: ColumnTargetDeps,
  previousColumnId: string | undefined,
): void => {
  const activeCell = deps.selection.getActiveCell();
  if (activeCell === null) return;
  const nextIndex =
    previousColumnId === undefined ? -1 : deps.columnModel.indexOf(previousColumnId);
  if (nextIndex === -1) {
    deps.selection.clearSelection();
    return;
  }
  if (nextIndex !== activeCell.col) {
    deps.selection.setActiveCell(activeCell.row, nextIndex);
  }
};
