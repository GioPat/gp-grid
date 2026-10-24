// packages/core/src/grid-core-edit.ts
// `GridCore.edit`: cell editing, the read-only peek overlay and clipboard paste.

import type { CellValue, EditState } from "./types";
import type { EditManager } from "./edit-manager";
import type { ColumnModel } from "./column-model";
import type { InstructionBatcher } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import type { SelectionManager } from "./selection";
import type { SlotPoolManager } from "./slot-pool";
import { isEmptyGroupCell } from "./row-group-layout";

export interface GridEditApi {
  /** Open an editor; false when the cell is not editable. */
  start(row: number, col: number): boolean;
  /** `editId` is the open edit's session token; a stale one is ignored. */
  updateValue(value: CellValue, editId?: number): void;
  commit(editId?: number): void;
  cancel(editId?: number): void;
  getState(): EditState | null;
  /**
   * Open a read-only multi-line overlay on a cell; false when the column is
   * not peekable or the cell is being edited.
   */
  startPeek(row: number, col: number): boolean;
  stopPeek(): void;
  getPeekState(): { row: number; col: number } | null;
  /** Paste tab/newline-separated text at the selection; ignored while editing. */
  paste(text: string): boolean;
}

export interface EditControllerDeps<TData> {
  batcher: InstructionBatcher;
  editManager: EditManager;
  columnModel: ColumnModel;
  selection: SelectionManager;
  rowData: RowDataManager<TData>;
  slotPool: SlotPoolManager;
  retainEditColumn: (columnId: string | null) => void;
}

export class EditController<TData> implements GridEditApi {
  private readonly deps: EditControllerDeps<TData>;

  constructor(deps: EditControllerDeps<TData>) {
    this.deps = deps;
  }

  start(row: number, col: number): boolean {
    // The edit manager owns the read-only check so a refused, editable cell
    // reports through the shared write-rejection diagnostic. Retention is
    // registered only for an edit that will open, inside the batch that
    // publishes START_EDIT and the window mounting its editor (B7).
    const { editManager, batcher } = this.deps;
    if (editManager.canEdit(col, row) === false) return editManager.startEdit(row, col);
    const columnId = this.deps.columnModel.idAt(col);
    batcher.start();
    try {
      if (columnId !== undefined) this.deps.retainEditColumn(columnId);
      return editManager.startEdit(row, col);
    } finally {
      batcher.flush();
    }
  }

  updateValue(value: CellValue, editId?: number): void {
    this.deps.editManager.updateValue(value, editId);
  }

  commit(editId?: number): void {
    this.deps.editManager.commit(editId);
  }

  cancel(editId?: number): void {
    this.deps.editManager.cancel(editId);
  }

  getState(): EditState | null {
    return this.deps.editManager.getState();
  }

  /** An empty group or total cell has nothing to peek. */
  startPeek(row: number, col: number): boolean {
    const { columnModel, rowData, editManager } = this.deps;
    const column = columnModel.columnAt(col);
    if (column === undefined || column.peekable === false) return false;
    if (isEmptyGroupCell(rowData.getHierarchyRow(row)?.kind, rowData.getCellValue(row, col))) return false;
    return editManager.startPeek(row, col);
  }

  stopPeek(): void {
    this.deps.editManager.stopPeek();
  }

  getPeekState(): { row: number; col: number } | null {
    return this.deps.editManager.getPeekState();
  }

  paste(text: string): boolean {
    if (this.deps.editManager.getState()) return false;
    const result = this.deps.selection.pasteClipboardText(text);
    if (result.changedCells.length > 0) this.deps.slotPool.refreshAllSlots();
    return result.handled;
  }
}
