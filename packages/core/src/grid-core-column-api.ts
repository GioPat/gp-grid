// packages/core/src/grid-core-column-api.ts
// `GridCore.columns`: definitions, per-column state, width, order, pinning and
// the displayed-width policy. Each command emits one instruction batch.

import type { ColumnDefinition, ColumnStateSnapshot, ColumnStateUpdate } from "./types";
import type { ColumnLayoutMode, ColumnPin } from "./types/geometry";
import type { GridGeometryService } from "./geometry";
import type { GridCoreConfig } from "./grid-core-config";
import {
  type ColumnCoreDeps,
  applyColumnPin,
  applyColumnStateReset,
  applyColumnStateUpdates,
  applySetColumns,
  readColumnState,
} from "./grid-core-columns";
import { type ColumnOperationDeps, applyColumnMove, applyColumnResize } from "./grid-core-operations";

export interface GridColumnsApi {
  /** Resolved columns in layout order. */
  get(): ColumnDefinition[];
  /**
   * Replace the definitions, reconciled by column id: retained ids keep user
   * state, sort and filter; new ids take definition defaults.
   */
  set(columns: ColumnDefinition[]): void;
  /** Set a displayed width in px; the stored override is back-solved to match. */
  setWidth(colIndex: number, width: number): void;
  move(fromIndex: number, toIndex: number): void;
  /**
   * Pin against the inline start or end edge, or unpin with `null`; the base
   * order is untouched, so unpinning returns the column to its slot.
   */
  setPinned(columnId: string, pinned: ColumnPin | null): void;
  /** Effective per-column width, visibility and order, in layout order. */
  getState(): ColumnStateSnapshot[];
  /** Explicit values win over retained user state and definition defaults. */
  setState(updates: ColumnStateUpdate[]): void;
  /** Drop user state for the given columns, or for all when omitted. */
  resetState(columnIds?: string[]): void;
  /** Switch the displayed-width policy; a no-op switch emits nothing. */
  setLayout(mode: ColumnLayoutMode): void;
}

export interface ColumnsControllerDeps<TData> extends ColumnCoreDeps<TData> {
  config: GridCoreConfig<TData>;
  getGeometry: () => GridGeometryService;
}

export class ColumnsController<TData> implements GridColumnsApi {
  private readonly deps: ColumnsControllerDeps<TData>;

  constructor(deps: ColumnsControllerDeps<TData>) {
    this.deps = deps;
  }

  get(): ColumnDefinition[] {
    return this.deps.columnModel.getLayout();
  }

  set(columns: ColumnDefinition[]): void {
    applySetColumns(this.deps, columns);
  }

  setWidth(colIndex: number, width: number): void {
    const applied = applyColumnResize(colIndex, width, this.operationDeps());
    if (applied === null) return;
    this.deps.config.onColumnResized?.({
      columnId: applied.columnId,
      width: applied.width,
      viewIndex: colIndex,
    });
  }

  move(fromIndex: number, toIndex: number): void {
    const applied = applyColumnMove(fromIndex, toIndex, this.operationDeps());
    if (applied === null) return;
    const { config } = this.deps;
    if (applied.pinChanged) {
      config.onColumnPinned?.({ columnId: applied.columnId, pinned: applied.pinned ?? null });
    }
    config.onColumnMoved?.({
      columnId: applied.columnId,
      fromViewIndex: applied.fromViewIndex,
      toViewIndex: applied.toViewIndex,
    });
  }

  setPinned(columnId: string, pinned: ColumnPin | null): void {
    if (applyColumnPin(this.deps, columnId, pinned) === false) return;
    this.deps.config.onColumnPinned?.({ columnId, pinned });
  }

  getState(): ColumnStateSnapshot[] {
    return readColumnState(this.deps);
  }

  setState(updates: ColumnStateUpdate[]): void {
    applyColumnStateUpdates(this.deps, updates);
  }

  resetState(columnIds?: string[]): void {
    applyColumnStateReset(this.deps, columnIds);
  }

  setLayout(mode: ColumnLayoutMode): void {
    const geometry = this.deps.getGeometry();
    if (geometry.getColumnLayoutMode() === mode) return;
    geometry.setColumnLayoutMode(mode);
    const { batcher, view } = this.deps;
    batcher.start();
    try {
      this.deps.refreshGeometry();
      view.emitContentSize();
      view.emitHeaders();
    } finally {
      batcher.flush();
    }
  }

  private operationDeps(): ColumnOperationDeps<TData> {
    const { columnModel } = this.deps;
    return {
      getLayout: () => columnModel.getLayout(),
      setColumnWidth: (columnId, width) => columnModel.setWidth(columnId, width),
      moveColumn: (fromIndex, toIndex) => columnModel.move(fromIndex, toIndex),
      columnModel,
      selection: this.deps.selection,
      editManager: this.deps.editManager,
      retainEditColumn: this.deps.retainEditColumn,
      refreshGeometry: this.deps.refreshGeometry,
      batcher: this.deps.batcher,
      view: this.deps.view,
    };
  }
}
