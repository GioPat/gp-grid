// packages/core/src/grid-core-columns.ts
// Column-state commands and schema reconciliation for GridCore. Extracted so
// the facade stays thin: every path here mutates the column model and emits
// exactly one instruction batch.

import type { ColumnModel, ColumnModelChange } from "./column-model";
import type { InstructionBatcher } from "./managers/instruction-batcher";
import type { SortFilterManager } from "./managers/sort-filter-manager";
import type { RowDataManager } from "./managers/row-data-manager";
import type { SelectionManager } from "./selection";
import type { EditManager } from "./edit-manager";
import type { ViewSync } from "./grid-core-view-sync";
import type {
  ColumnDefinition,
  ColumnId,
  RowId,
  ColumnStateSnapshot,
  ColumnStateUpdate,
} from "./types";
import type { ColumnLayoutSnapshot } from "./types/geometry";

export interface ColumnCoreDeps<TData> {
  batcher: InstructionBatcher;
  columnModel: ColumnModel;
  selection: SelectionManager;
  editManager: EditManager;
  sortFilter: SortFilterManager<TData>;
  rowData: RowDataManager<TData>;
  view: ViewSync<TData>;
  /** Current displayed-column layout, used to compose state snapshots. */
  getColumnLayout: () => ColumnLayoutSnapshot;
  /** Commit column/row geometry before a batch captures its revision. */
  refreshGeometry: () => void;
  reloadAfterSchemaChange: () => Promise<void>;
}

/** Apply explicit state; explicit values beat retained user state. */
export const applyColumnStateUpdates = <TData>(
  deps: ColumnCoreDeps<TData>,
  updates: ColumnStateUpdate[],
): void => {
  const targets = captureColumnTargets(deps);
  applyColumnStateChange(deps, deps.columnModel.setState(updates), targets);
};

/** Drop user column state for the given ids, or for every column. */
export const applyColumnStateReset = <TData>(
  deps: ColumnCoreDeps<TData>,
  columnIds?: ColumnId[],
): void => {
  const targets = captureColumnTargets(deps);
  applyColumnStateChange(deps, deps.columnModel.resetState(columnIds), targets);
};

export const readColumnState = <TData>(
  deps: ColumnCoreDeps<TData>,
): ColumnStateSnapshot[] => {
  const resolved = new Map(
    deps.getColumnLayout().columns.map((column) => [column.columnId, column.width]),
  );
  return deps.columnModel.getState().map((state) => ({
    ...state,
    resolvedWidth: resolved.get(state.columnId) ?? 0,
  }));
};

/**
 * Replace caller definitions and reconcile everything that depends on column
 * identity in one batch: headers, sort/filter, edit target, active cell,
 * selection and slots. Sort/filter entries on removed columns trigger one
 * data re-query.
 */
export const applySetColumns = <TData>(
  deps: ColumnCoreDeps<TData>,
  columns: ColumnDefinition[],
): void => {
  const targets = captureColumnTargets(deps);
  const activeCell = deps.selection.getActiveCell();
  const activeRowId = activeCell ? deps.rowData.getRowId(activeCell.row) : undefined;
  const previousIds = deps.columnModel.ids();
  let sortFilterChanged = false;
  deps.batcher.start();
  try {
    deps.columnModel.setDefinitions(columns);
    deps.refreshGeometry();
    sortFilterChanged = deps.sortFilter.reconcileColumns(
      new Set(deps.columnModel.ids()),
    );
    reconcileColumnTargets(deps, targets);
    if (hasSameOrder(previousIds, deps.columnModel.ids()) === false) {
      deps.selection.clearSelectionRange();
    }
    deps.view.reconcile();
  } finally {
    deps.batcher.flush();
  }
  // Never rejects: a failed query is reported through DATA_ERROR.
  if (sortFilterChanged) {
    void deps.reloadAfterSchemaChange().then(() => restoreActiveRow(deps, activeRowId));
  }
};

/** The reload reorders rows: follow the active record, or clear the cell. */
const restoreActiveRow = <TData>(
  deps: ColumnCoreDeps<TData>,
  rowId: RowId | undefined,
): void => {
  const activeCell = deps.selection.getActiveCell();
  if (activeCell === null || rowId === undefined) return;
  if (deps.rowData.getRowId(activeCell.row) === rowId) return;
  const nextRow = deps.rowData.findViewIndexById(rowId);
  if (nextRow === -1) {
    deps.selection.clearSelection();
    return;
  }
  deps.selection.setActiveCell(nextRow, activeCell.col);
};

const hasSameOrder = (before: readonly ColumnId[], after: readonly ColumnId[]): boolean =>
  before.length === after.length && before.every((id, index) => id === after[index]);

/** Column identities of everything addressed by a column index. */
interface ColumnTargets {
  edit: ColumnId | undefined;
  peek: ColumnId | undefined;
  active: ColumnId | undefined;
}

const captureColumnTargets = <TData>(deps: ColumnCoreDeps<TData>): ColumnTargets => {
  const edit = deps.editManager.getState();
  const peek = deps.editManager.getPeekState();
  const activeCell = deps.selection.getActiveCell();
  return {
    edit: edit ? deps.columnModel.idAt(edit.col) : undefined,
    peek: peek ? deps.columnModel.idAt(peek.col) : undefined,
    active: activeCell ? deps.columnModel.idAt(activeCell.col) : undefined,
  };
};

const reconcileColumnTargets = <TData>(
  deps: ColumnCoreDeps<TData>,
  targets: ColumnTargets,
): void => {
  reconcileEditState(deps, targets.edit);
  reconcilePeekState(deps, targets.peek);
  reconcileActiveCell(deps, targets.active);
};

const applyColumnStateChange = <TData>(
  deps: ColumnCoreDeps<TData>,
  change: ColumnModelChange,
  targets: ColumnTargets,
): void => {
  const changed = change.orderChanged || change.widthChanged || change.hiddenChanged;
  if (changed === false) return;
  deps.batcher.start();
  try {
    deps.refreshGeometry();
    deps.view.syncColumnLayout(change.orderChanged ? "order" : "geometry");
    if (change.orderChanged) deps.selection.clearSelectionRange();
    reconcileColumnTargets(deps, targets);
  } finally {
    deps.batcher.flush();
  }
};

/** Cancel an edit whose column was removed, or follow it to its new index. */
const reconcileEditState = <TData>(
  deps: ColumnCoreDeps<TData>,
  previousColumnId: ColumnId | undefined,
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

const reconcilePeekState = <TData>(
  deps: ColumnCoreDeps<TData>,
  previousColumnId: ColumnId | undefined,
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
const reconcileActiveCell = <TData>(
  deps: ColumnCoreDeps<TData>,
  previousColumnId: ColumnId | undefined,
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
