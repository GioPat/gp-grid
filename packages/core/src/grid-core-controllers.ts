// packages/core/src/grid-core-controllers.ts
// Construction of the header and column controllers for GridCore. They are
// built together because every column command that can change the band count
// runs inside the header controller's applier.

import type { ColumnModel } from "./column-model";
import type { GridGeometryService } from "./geometry";
import type { InstructionBatcher } from "./managers";
import type { GridCoreConfig } from "./grid-core-config";
import type { GridManagers } from "./grid-core-managers";
import type { ViewportController } from "./grid-core-viewport";
import type { ColumnGroupState } from "./grid-core-column-guard";
import { HeaderController } from "./grid-core-header";
import { ColumnsController } from "./grid-core-column-api";

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
