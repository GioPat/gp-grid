// packages/core/src/grid-core-controllers.ts
// Construction of GridCore's namespace controllers. The header and column
// controllers are built together because every column command that can change
// the band count runs inside the header controller's applier.

import type { ColumnModel } from "./column-model";
import type { GridGeometryService } from "./geometry";
import type { InstructionBatcher } from "./managers";
import type { GridCoreConfig } from "./grid-core-config";
import type { GridManagers } from "./grid-core-managers";
import type { ViewportController } from "./grid-core-viewport";
import type { ColumnGroupState } from "./grid-core-column-guard";
import { HeaderController } from "./grid-core-header";
import { ColumnsController } from "./grid-core-column-api";
import type { GridGeometry } from "./types/geometry";
import { RowsController } from "./grid-core-rows";
import { CellsController } from "./grid-core-cells";
import { EditController } from "./grid-core-edit";
import { RowDragController } from "./grid-core-row-drag";
import { RowGroupsController } from "./grid-core-row-groups";
import type { HierarchyChangeDeps } from "./grid-core-hierarchy-change";

export interface ColumnControllersDeps<TData> {
  config: GridCoreConfig<TData>;
  batcher: InstructionBatcher;
  columnModel: ColumnModel;
  groups: ColumnGroupState;
  managers: GridManagers<TData>;
  viewportController: ViewportController<TData>;
  getGeometry: () => GridGeometryService;
  /** Bounded keep-alive for the edited column (B7). */
  retainEditColumn: (columnId: string | null) => void;
  reloadAfterSchemaChange: () => Promise<void>;
  isDestroyed: () => boolean;
}

export interface ColumnControllers<TData> {
  header: HeaderController<TData>;
  columns: ColumnsController<TData>;
}

/** No controller reads anything at construction, so both may precede the first refresh. */
export const buildColumnControllers = <TData>(
  deps: ColumnControllersDeps<TData>,
): ColumnControllers<TData> => {
  const { config, batcher, managers, viewportController, getGeometry, isDestroyed } = deps;
  const refreshGeometry = (): void => viewportController.refreshGeometry();
  const header = new HeaderController<TData>({
    batcher,
    config,
    viewport: managers.viewport,
    getGeometry,
    getRowData: () => managers.rowData,
    getView: () => managers.view,
    refreshGeometry,
    writeScrollTop: (domScrollTop) => viewportController.writeScrollTop(domScrollTop),
    isDestroyed,
  });
  const columns = new ColumnsController<TData>({
    config,
    batcher,
    columnModel: deps.columnModel,
    selection: managers.selection,
    editManager: managers.editManager,
    sortFilter: managers.sortFilter,
    rowData: managers.rowData,
    view: managers.view,
    getGeometry,
    groups: deps.groups,
    getColumnLayout: () => getGeometry().getColumnLayout(),
    refreshGeometry,
    retainEditColumn: deps.retainEditColumn,
    reloadAfterSchemaChange: deps.reloadAfterSchemaChange,
    isDestroyed,
    applyBandChange: (change) => header.applyBandChange(change),
  });
  return { header, columns };
};

export interface RowControllersDeps<TData> {
  config: GridCoreConfig<TData>;
  batcher: InstructionBatcher;
  columnModel: ColumnModel;
  managers: GridManagers<TData>;
  viewportController: ViewportController<TData>;
  getGeometry: () => GridGeometryService;
  geometry: GridGeometry;
  retainEditColumn: (columnId: string | null) => void;
  /** The move changed row identity, so heights must be re-placed (D6). */
  onRowsMoved: () => void;
  isDestroyed: () => boolean;
}

export interface RowControllers<TData> {
  rows: RowsController<TData>;
  cells: CellsController<TData>;
  edit: EditController;
  rowDrag: RowDragController<TData>;
  rowGroups: RowGroupsController<TData>;
  /** The D4 applier's inputs, shared with a transaction refresh. */
  hierarchyChange: HierarchyChangeDeps<TData>;
}

export const buildRowControllers = <TData>(deps: RowControllersDeps<TData>): RowControllers<TData> => {
  const { config, batcher, managers, viewportController } = deps;
  const { rowData, slotPool, selection, editManager } = managers;
  const hierarchyChange: HierarchyChangeDeps<TData> = {
    batcher,
    selection,
    editManager,
    getGeometry: deps.getGeometry,
    getRowData: () => rowData,
    getView: () => managers.view,
    refreshGeometry: () => viewportController.refreshGeometry(),
    writeScrollTop: (domScrollTop) => viewportController.writeScrollTop(domScrollTop),
  };
  return {
    rows: new RowsController({ rowData, slotPool }),
    cells: new CellsController({ rowData, geometry: deps.geometry, writes: managers.recordWrites }),
    edit: new EditController({
      batcher,
      editManager,
      columnModel: deps.columnModel,
      selection,
      retainEditColumn: deps.retainEditColumn,
      refreshSlotData: () => slotPool.refreshAllSlots(),
    }),
    rowDrag: new RowDragController({
      config,
      rowData,
      slotPool,
      highlight: managers.highlight,
      onRowsMoved: deps.onRowsMoved,
    }),
    rowGroups: new RowGroupsController({
      ...hierarchyChange,
      isDestroyed: deps.isDestroyed,
      onRowGroupToggled: config.onRowGroupToggled,
    }),
    hierarchyChange,
  };
};
