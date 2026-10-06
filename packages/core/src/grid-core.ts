// @gp-grid/core/src/grid-core.ts

import type { GridCoreOptions, BatchInstructionListener, DataSource } from "./types";
import type { SelectionManager } from "./selection";
import { toReadonlyGeometry, type FrozenRowsRequest, type GridGeometryService } from "./geometry";
import type { GridGeometry } from "./types/geometry";
import type { FillManager } from "./fill";
import type { SlotPoolManager } from "./slot-pool";
import type { EditManager } from "./edit-manager";
import { InputHandler } from "./input-handler";
import type { HighlightManager, SortFilterManager } from "./managers";
import { InstructionBatcher } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import { RowHeightOverrides, type LocateRowIds } from "./managers/row-height-overrides";
import { type GridCoreConfig, resolveGridCoreConfig } from "./grid-core-config";
import { buildGridManagers } from "./grid-core-managers";
import { createCoreGeometry } from "./grid-core-geometry";
import { ColumnModel } from "./column-model";
import type { ViewSync } from "./grid-core-view-sync";
import { FrozenRowsController, type GridFrozenRowsApi } from "./grid-core-frozen-rows";
import { RowHeightsController, type GridRowHeightsApi } from "./grid-core-row-heights";
import { ViewportController, type GridViewportApi } from "./grid-core-viewport";
import type { GridEditApi } from "./grid-core-edit";
import type { GridCellsApi } from "./grid-core-cells";
import type { GridRowsApi } from "./grid-core-rows";
import type { GridColumnsApi } from "./grid-core-column-api";
import type { GridHeaderApi } from "./grid-core-header";
import { buildColumnControllers, buildRowControllers } from "./grid-core-controllers";
import { adoptInitialColumnGroups } from "./grid-core-column-groups";
import type { ColumnGroupState } from "./grid-core-column-guard";
import type { GridRowDragApi } from "./grid-core-row-drag";
import type { RowGroupsController, GridRowGroupsApi } from "./grid-core-row-groups";
import { applyViewRowsChange, reloadViewRows, type HierarchyChangeDeps } from "./grid-core-hierarchy-change";

/**
 * The framework-agnostic grid. Owns lifecycle, the viewport sample and data
 * loading; every feature lives on a namespace (`rows`, `cells`, `edit`, …).
 */
export class GridCore<TData = unknown> {
  /** Single owner of column/row geometry; wrappers read this, never recompute. */
  public readonly geometry: GridGeometry;
  public readonly rows: GridRowsApi<TData>;
  public readonly cells: GridCellsApi;
  public readonly edit: GridEditApi;
  public readonly columns: GridColumnsApi;
  /** Header bands, shared by every pin region (PRD 007). */
  public readonly header: GridHeaderApi;
  public readonly frozenRows: GridFrozenRowsApi;
  /** Application-set row heights by identity (PRD 006). */
  public readonly rowHeights: GridRowHeightsApi;
  public readonly rowDrag: GridRowDragApi;
  /** Expansion of a bound hierarchy (PRD 008). */
  public readonly rowGroups: GridRowGroupsApi;
  /** Scroll hooks for adapters driving a synthetic touch scroller. */
  public readonly viewport: GridViewportApi;
  public readonly selection: SelectionManager;
  public readonly fill: FillManager;
  public readonly input: InputHandler<TData>;
  public readonly highlight: HighlightManager<TData> | null;
  public readonly sortFilter: SortFilterManager<TData>;

  private readonly config: GridCoreConfig<TData>;
  private readonly batcher = new InstructionBatcher();
  private readonly columnModel: ColumnModel;
  private readonly columnGroups: ColumnGroupState;
  private readonly geometryService: GridGeometryService;
  private readonly viewportController: ViewportController<TData>;
  private readonly frozenRowsController: FrozenRowsController<TData>;
  private readonly rowHeightsController: RowHeightsController<TData>;
  private readonly rowHeightOverrides: RowHeightOverrides;
  private readonly scanRowIds: LocateRowIds = (ids) => this.rowData.locateRowIds(ids);
  private readonly rowData: RowDataManager<TData>;
  private readonly slotPool: SlotPoolManager;
  private readonly editManager: EditManager;
  private readonly rowGroupsController: RowGroupsController<TData>;
  private readonly hierarchyChange: HierarchyChangeDeps<TData>;
  // Derived-view emission: content size, headers, visible range, slots
  private readonly view: ViewSync<TData>;
  private isDestroyed: boolean = false;

  constructor(options: GridCoreOptions<TData>) {
    this.config = resolveGridCoreConfig(options);
    const adopted = adoptInitialColumnGroups(options.columns, this.config);
    this.columnGroups = adopted.state;
    this.columnModel = new ColumnModel(adopted.columns);

    const managers = buildGridManagers<TData>({
      batcher: this.batcher,
      config: this.config,
      getColumns: () => this.columnModel.getLayout(),
      getGeometry: () => this.geometryService,
      getFrozenRowsBaseline: () => this.frozenRowsController.getBaseline(),
      getHeaderBands: () => this.header.getBands(),
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
      onRowsLoaded: (totalRowsChanged) =>
        this.rowHeightsController.onRowsLoaded(totalRowsChanged),
      applyViewRowsChange: (change) => applyViewRowsChange(this.hierarchyChange, change),
    });
    this.rowData = managers.rowData;
    this.rowHeightOverrides = new RowHeightOverrides({
      getRowHeight: () => this.config.rowHeight,
      getRowCount: () => this.rowData.getTotalRows(),
      hasStableIdentity: () => this.rowData.hasStableIdentity(),
      getDataRevision: () => this.rowData.getDataRevision(),
    });
    this.selection = managers.selection;
    this.highlight = managers.highlight;
    this.fill = managers.fill;
    this.slotPool = managers.slotPool;
    this.editManager = managers.editManager;
    this.sortFilter = managers.sortFilter;
    this.view = managers.view;

    this.viewportController = new ViewportController<TData>({
      batcher: this.batcher,
      state: managers.viewport,
      scrollVirtualization: managers.scrollVirtualization,
      maxFlingVelocity: this.config.maxFlingVelocity,
      rowHeight: this.config.rowHeight,
      getGeometry: () => this.geometryService,
      getRowData: () => this.rowData,
      getView: () => this.view,
    });
    this.frozenRowsController = new FrozenRowsController<TData>({
      initial: this.config.freezeRows,
      batcher: this.batcher,
      getGeometry: () => this.geometryService,
      getRowData: () => this.rowData,
      getView: () => this.view,
      getEditManager: () => this.editManager,
      refreshGeometry: () => this.viewportController.refreshGeometry(),
      writeScrollTop: (domScrollTop) => this.viewportController.writeScrollTop(domScrollTop),
      isDestroyed: () => this.isDestroyed,
    });
    this.geometryService = createCoreGeometry({
      config: this.config,
      columnModel: this.columnModel,
      rowData: this.rowData,
      viewport: managers.viewport,
      scrollVirtualization: managers.scrollVirtualization,
      getDomScrollTop: () => this.viewportController.getDomScrollTop(),
      getFrozenRowsRequest: () => this.frozenRowsController.getRequest(),
      columnGroups: this.columnGroups,
      getPlacedRowSizes: () =>
        this.rowHeightOverrides.getPlaced({
          revision: this.rowData.getDataRevision(),
          rowCount: this.rowData.getTotalRows(),
          defaultSize: this.config.rowHeight,
          stableIdentity: this.rowData.hasStableIdentity(),
          scan: this.scanRowIds,
        }),
    });
    this.geometry = toReadonlyGeometry(this.geometryService);
    // Before the first refresh: the scroll mapping reads the header height.
    const controllers = buildColumnControllers<TData>({
      config: this.config,
      batcher: this.batcher,
      columnModel: this.columnModel,
      groups: this.columnGroups,
      managers,
      viewportController: this.viewportController,
      getGeometry: () => this.geometryService,
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
      reloadAfterSchemaChange: () => this.refresh(),
      isDestroyed: () => this.isDestroyed,
    });
    this.header = controllers.header;
    this.columns = controllers.columns;
    this.geometryService.refresh();
    this.frozenRowsController.captureBaseline();
    this.rowHeightsController = new RowHeightsController<TData>({
      batcher: this.batcher,
      overrides: this.rowHeightOverrides,
      getGeometry: () => this.geometryService,
      getRowData: () => this.rowData,
      getView: () => this.view,
      refreshGeometry: () => this.viewportController.refreshGeometry(),
      writeScrollTop: (domScrollTop) => this.viewportController.writeScrollTop(domScrollTop),
      isDestroyed: () => this.isDestroyed,
      measurementHost: this.config.measurementHost,
      fitLimits: { min: this.config.autoFit.minRowHeight, max: this.config.autoFit.maxRowHeight },
      onRowResized: this.config.onRowResized,
      resizable: this.config.rowResize,
    });

    this.viewport = this.viewportController;
    this.frozenRows = this.frozenRowsController;
    this.rowHeights = this.rowHeightsController;
    const rowControllers = buildRowControllers<TData>({
      config: this.config,
      batcher: this.batcher,
      columnModel: this.columnModel,
      managers,
      viewportController: this.viewportController,
      getGeometry: () => this.geometryService,
      geometry: this.geometry,
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
      onRowsMoved: () => this.rowHeightsController.onRowsMoved(),
      isDestroyed: () => this.isDestroyed,
    });
    this.rows = rowControllers.rows;
    this.cells = rowControllers.cells;
    this.edit = rowControllers.edit;
    this.rowDrag = rowControllers.rowDrag;
    this.rowGroupsController = rowControllers.rowGroups;
    this.rowGroups = this.rowGroupsController;
    this.hierarchyChange = rowControllers.hierarchyChange;
    this.input = new InputHandler(this, {
      maxRowHeight: this.config.autoFit.maxRowHeight,
      resizeRow: (viewIndex, height) => this.rowHeightsController.resize(viewIndex, height),
      toggleGroupAt: (viewIndex) => this.rowGroupsController.toggleAt(viewIndex),
    });
  }

  /**
   * Subscribe to batched instructions. Listeners receive arrays of
   * instructions instead of individual ones.
   */
  onBatchInstruction(listener: BatchInstructionListener): () => void {
    return this.batcher.subscribe(listener);
  }

  /** Load the initial data. */
  async initialize(): Promise<void> {
    await this.rowData.loadInitial();
    this.view.reconcile();
  }

  /**
   * Update viewport measurements and sync slots. Under scroll virtualization
   * the DOM scroll position is mapped to the logical row position.
   */
  setViewport(scrollTop: number, scrollLeft: number, width: number, height: number): void {
    this.viewportController.update(scrollTop, scrollLeft, width, height);
  }

  /**
   * The C2 frozen-rows request seam, applied in one atomic batch.
   *
   * @internal
   */
  setFrozenRowsRequest(request: FrozenRowsRequest | null): void {
    this.frozenRowsController.apply(request);
  }

  /** Reload everything from the data source. */
  async refresh(): Promise<void> {
    await this.rowData.loadInitial();
    this.view.reconcile();
  }

  /**
   * Fast-path refresh after `MutableDataSource` transactions: only the
   * visible window is re-fetched. Under a hierarchy the anchor and the active
   * row follow their identity (D4).
   */
  async refreshFromTransaction(): Promise<void> {
    const reload = () => this.rowData.refreshFromTransaction();
    if (this.rowData.getHierarchy()) {
      await reloadViewRows(this.hierarchyChange, reload);
      return;
    }
    await reload();
    this.view.reconcile();
  }

  /**
   * Swap the data source, keeping sort, filter and scroll position. An open
   * edit is cancelled and the selection is cleared when it falls out of range.
   */
  async setDataSource(dataSource: DataSource<TData>): Promise<void> {
    if (this.editManager.getState()) this.editManager.cancel();
    this.rowData.setDataSource(dataSource);
    await this.refresh();
    const activeCell = this.selection.getActiveCell();
    if (activeCell && activeCell.row >= this.rowData.getTotalRows()) {
      this.selection.clearSelection();
    }
  }

  /** Release every listener and manager; idempotent. */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.rowHeightsController.clear();
    this.slotPool.destroy();
    this.highlight?.destroy();
    this.sortFilter.destroy();
    this.rowData.destroy();
    this.batcher.clearListeners();
  }

  /** Bounded keep-alive for the edited column (B7), published as a batch. */
  private retainEditColumn(columnId: string | null): void {
    this.geometryService.retainColumns("edit", columnId === null ? [] : [columnId]);
    this.view.syncEditRetention();
  }
}
