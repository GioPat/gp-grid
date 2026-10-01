// packages/core/src/grid-core-columns.ts
// Column-state commands and schema reconciliation for GridCore. Extracted so
// the facade stays thin: every path here mutates the column model and emits
// exactly one instruction batch, unless the guard's admission refuses the
// mutated model, which it restores before anything is published.

import type { ColumnModel, ColumnModelChange } from "./column-model";
import type { InstructionBatcher } from "./managers/instruction-batcher";
import type { SortFilterManager } from "./managers/sort-filter-manager";
import type { RowDataManager } from "./managers/row-data-manager";
import type { SelectionManager } from "./selection";
import type { EditManager } from "./edit-manager";
import type { ViewSync } from "./grid-core-view-sync";
import type {
  ColumnDefinition,
  ColumnPin,
  RowId,
  ColumnStateSnapshot,
  ColumnStateUpdate,
} from "./types";
import type { ColumnLayoutSnapshot } from "./types/geometry";
import {
  captureColumnTargets,
  reconcileColumnTargets,
  syncEditRetention,
  type ColumnTargets,
} from "./grid-core-column-targets";
import { admitEveryChange, type AdmitColumnChange } from "./grid-core-column-guard";

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
  /** Keep the edited column mounted while an edit is open. */
  retainEditColumn: (columnId: string | null) => void;
  reloadAfterSchemaChange: () => Promise<void>;
}

/**
 * Apply explicit state; explicit values beat retained user state. Returns
 * whether anything was published.
 */
export const applyColumnStateUpdates = <TData>(
  deps: ColumnCoreDeps<TData>,
  updates: ColumnStateUpdate[],
  admit: AdmitColumnChange = admitEveryChange,
): boolean => {
  const targets = captureColumnTargets(deps);
  const hiding = new Set(updates.filter((update) => update.hidden === true).map((u) => u.columnId));
  commitHiddenEdit(deps, (columnId) => hiding.has(columnId));
  return applyColumnStateChange(deps, deps.columnModel.setState(updates), targets, admit);
};

/** Drop user column state for the given ids, or for every column. */
export const applyColumnStateReset = <TData>(
  deps: ColumnCoreDeps<TData>,
  columnIds?: string[],
  admit: AdmitColumnChange = admitEveryChange,
): boolean => {
  const targets = captureColumnTargets(deps);
  // Only an edit on a column that is about to become hidden is committed: a
  // reset of width/order/pin leaves the editor in place (B7).
  commitHiddenEdit(deps, (columnId) => isHiddenAfterReset(deps, columnId, columnIds));
  return applyColumnStateChange(deps, deps.columnModel.resetState(columnIds), targets, admit);
};

/** Whether dropping a column's state restores a hidden definition default. */
const isHiddenAfterReset = <TData>(
  deps: ColumnCoreDeps<TData>,
  columnId: string,
  columnIds: readonly string[] | undefined,
): boolean => {
  if (columnIds?.includes(columnId) === false) return false;
  return deps.columnModel.getDefinition(columnId)?.hidden === true;
};

/**
 * Pin a column against a viewport edge, or unpin it with `null`. Handled
 * downstream exactly like an order change; returns whether anything changed.
 */
export const applyColumnPin = <TData>(
  deps: ColumnCoreDeps<TData>,
  columnId: string,
  pinned: ColumnPin | null,
  admit: AdmitColumnChange = admitEveryChange,
): boolean => {
  const before = deps.columnModel.getPin(columnId);
  if (deps.columnModel.has(columnId) === false) return false;
  if (before === pinned) return false;
  const targets = captureColumnTargets(deps);
  deps.columnModel.setPinned(columnId, pinned);
  return applyColumnStateChange(
    deps,
    { orderChanged: true, widthChanged: false, hiddenChanged: false, pinChanged: true },
    targets,
    admit,
  );
};

export const readColumnState = <TData>(
  deps: ColumnCoreDeps<TData>,
): ColumnStateSnapshot[] => {
  const displayed = new Map(
    deps.getColumnLayout().columns.map((column) => [column.columnId, column]),
  );
  return deps.columnModel.getState().map((state) => {
    const column = displayed.get(state.columnId);
    return {
      ...state,
      resolvedWidth: column?.width ?? 0,
      region: column?.region ?? null,
    };
  });
};

/**
 * Replace caller definitions and reconcile everything that depends on column
 * identity in one batch: headers, sort/filter, edit target, active cell,
 * selection and slots. Sort/filter entries on removed columns trigger one
 * data re-query. Returns whether the definitions were adopted.
 */
export const applySetColumns = <TData>(
  deps: ColumnCoreDeps<TData>,
  columns: readonly ColumnDefinition[],
  admit: AdmitColumnChange = admitEveryChange,
): boolean => {
  const targets = captureColumnTargets(deps);
  const activeCell = deps.selection.getActiveCell();
  const activeRowId = activeCell ? deps.rowData.getRowId(activeCell.row) : undefined;
  const previousIds = deps.columnModel.ids();
  let sortFilterChanged = false;
  deps.batcher.start();
  try {
    deps.columnModel.setDefinitions(columns);
    if (admit() === false) return false;
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
  return true;
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

const hasSameOrder = (before: readonly string[], after: readonly string[]): boolean =>
  before.length === after.length && before.every((id, index) => id === after[index]);

const applyColumnStateChange = <TData>(
  deps: ColumnCoreDeps<TData>,
  change: ColumnModelChange,
  targets: ColumnTargets,
  admit: AdmitColumnChange,
): boolean => {
  const changed =
    change.orderChanged || change.widthChanged || change.hiddenChanged || change.pinChanged;
  if (changed === false || admit() === false) return false;
  // A pin change reorders the visual layout and must not be published as a
  // geometry-only change, which would leave cell contents behind.
  const orderChange = change.orderChanged || change.pinChanged;
  deps.batcher.start();
  try {
    deps.refreshGeometry();
    deps.view.syncColumnLayout(orderChange ? "order" : "geometry");
    if (orderChange) deps.selection.clearSelectionRange();
    reconcileColumnTargets(deps, targets);
    syncEditRetention(deps);
  } finally {
    deps.batcher.flush();
  }
  return true;
};

/**
 * Commit an edit whose column is about to leave the displayed layout. The
 * editor's value is never discarded silently.
 */
const commitHiddenEdit = <TData>(
  deps: ColumnCoreDeps<TData>,
  willHide: (columnId: string) => boolean,
): void => {
  const edit = deps.editManager.getState();
  if (edit === null) return;
  const editingColumnId = deps.columnModel.idAt(edit.col);
  if (editingColumnId === undefined || willHide(editingColumnId) === false) return;
  deps.editManager.commit(edit.editId);
};

