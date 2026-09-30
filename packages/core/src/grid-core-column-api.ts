// packages/core/src/grid-core-column-api.ts
// `GridCore.columns`: definitions, per-column state, width, order, pinning,
// the one-shot column fit and the displayed-width policy. Each command emits
// one instruction batch.

import type { ColumnDefinition, ColumnStateSnapshot, ColumnStateUpdate } from "./types";
import type { ColumnFitResult } from "./types/measurement";
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
import {
  resolveColumnFit,
  resolveColumnFitTargets,
  unsupportedColumnFit,
} from "./grid-core-fit";

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
  /**
   * Explicit values win over retained user state and definition defaults;
   * `width: null` drops the pixel override.
   */
  setState(updates: ColumnStateUpdate[]): void;
  /** Drop user state for the given columns, or for all when omitted. */
  resetState(columnIds?: string[]): void;
  /** Switch the displayed-width policy; a no-op switch emits nothing. */
  setLayout(mode: ColumnLayoutMode): void;
  /**
   * Fit mounted displayed columns to their widest rendered header or cell
   * once, all of them when `columnIds` is omitted. The widths become pixel
   * overrides in one batch; issues no data request.
   */
  fit(columnIds?: readonly string[]): ColumnFitResult;
}

export interface ColumnsControllerDeps<TData> extends ColumnCoreDeps<TData> {
  config: GridCoreConfig<TData>;
  getGeometry: () => GridGeometryService;
  isDestroyed: () => boolean;
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

  fit(columnIds?: readonly string[]): ColumnFitResult {
    const { config, columnModel } = this.deps;
    const host = config.measurementHost;
    if (this.deps.isDestroyed() || host === undefined) return unsupportedColumnFit();
    const geometry = this.deps.getGeometry();
    const columnWindow = geometry.getColumnWindow();
    const { targets, skipped } = resolveColumnFitTargets(
      columnWindow,
      columnIds,
      (columnId) => columnModel.has(columnId),
      config.autoFit.maxColumnWidth,
    );
    const { result, changes } = resolveColumnFit({
      measurement: host.measureColumns(targets.map((target) => target.layoutIndex)),
      layoutRevision: columnWindow.layout.revision,
      targets,
      skipped,
      widthOf: (layoutIndex) => geometry.getColumn(layoutIndex)?.width ?? 0,
    });
    if (result.columns.length > 0) {
      const updates = result.columns.map(({ columnId, width }) => ({ columnId, width }));
      applyColumnStateUpdates(this.deps, updates);
    }
    for (const { columnId, width, layoutIndex } of changes) {
      config.onColumnResized?.({ columnId, width, viewIndex: layoutIndex });
    }
    return result;
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
