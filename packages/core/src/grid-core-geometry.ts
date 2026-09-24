// packages/core/src/grid-core-geometry.ts
// Binds the geometry service to GridCore's live state.

import { createGridGeometry, type FrozenRowsRequest, type GridGeometryService } from "./geometry";
import type { ColumnModel } from "./column-model";
import type { ScrollVirtualizationManager, ViewportState } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import type { GridCoreConfig } from "./grid-core-config";

export interface CoreGeometryDeps<TData> {
  config: GridCoreConfig<TData>;
  columnModel: ColumnModel;
  rowData: RowDataManager<TData>;
  viewport: ViewportState;
  scrollVirtualization: ScrollVirtualizationManager;
  /** Effective DOM scroll sample, including the touch override. */
  getDomScrollTop: () => number;
  getFrozenRowsRequest: () => FrozenRowsRequest | null;
}

export const createCoreGeometry = <TData>(deps: CoreGeometryDeps<TData>): GridGeometryService => {
  const { config, columnModel, rowData, viewport, scrollVirtualization } = deps;
  return createGridGeometry(
    {
      getRowCount: () => rowData.getTotalRows(),
      getRowHeight: () => config.rowHeight,
      getOverscan: () => config.overscan,
      getColumnOverscan: () => config.columnOverscan,
      getColumns: () => columnModel.getLayout(),
      isWidthOverridden: (layoutIndex) => columnModel.isWidthOverriddenAt(layoutIndex),
      getViewport: () => ({
        width: viewport.getViewportWidth(),
        height: viewport.getViewportHeight(),
        measured: viewport.isMeasured(),
        scrollLeft: viewport.getScrollLeft(),
        scrollTop: deps.getDomScrollTop(),
      }),
      getFrozenRowsRequest: deps.getFrozenRowsRequest,
      getScrollMapping: () => ({
        getDomScrollTop: deps.getDomScrollTop,
        toDomScrollTop: (logical) => scrollVirtualization.toDomScrollTop(logical),
        toLogicalScrollTop: (dom) => scrollVirtualization.toLogicalScrollTop(dom),
        isScalingActive: () => scrollVirtualization.isScalingActive(),
        getMaxLogicalScrollTop: () => scrollVirtualization.getMaxLogicalScrollTop(),
      }),
    },
    config.columnLayout,
  );
};
