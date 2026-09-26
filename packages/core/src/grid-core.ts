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
import { type GridCoreConfig, resolveGridCoreConfig } from "./grid-core-config";
import { buildGridManagers } from "./grid-core-managers";
import { createCoreGeometry } from "./grid-core-geometry";
import { ColumnModel } from "./column-model";
import type { ViewSync } from "./grid-core-view-sync";
import { FrozenRowsController, type GridFrozenRowsApi } from "./grid-core-frozen-rows";
import { ViewportController, type GridViewportApi } from "./grid-core-viewport";
import { EditController, type GridEditApi } from "./grid-core-edit";
import { CellsController, type GridCellsApi } from "./grid-core-cells";
import { RowsController, type GridRowsApi } from "./grid-core-rows";
import { ColumnsController, type GridColumnsApi } from "./grid-core-column-api";
import { RowDragController, type GridRowDragApi } from "./grid-core-row-drag";

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
  public readonly frozenRows: GridFrozenRowsApi;
  public readonly rowDrag: GridRowDragApi;
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
  private readonly geometryService: GridGeometryService;
  private readonly viewportController: ViewportController<TData>;
  private readonly frozenRowsController: FrozenRowsController<TData>;
  private readonly rowData: RowDataManager<TData>;
  private readonly slotPool: SlotPoolManager;
  private readonly editManager: EditManager;
  // Derived-view emission: content size, headers, visible range, slots
  private readonly view: ViewSync<TData>;
  private isDestroyed: boolean = false;

  constructor(options: GridCoreOptions<TData>) {
    this.config = resolveGridCoreConfig(options);
    this.columnModel = new ColumnModel(options.columns);

    const managers = buildGridManagers<TData>({
      batcher: this.batcher,
      config: this.config,
      getColumns: () => this.columnModel.getLayout(),
      getGeometry: () => this.geometryService,
      getFrozenRowsBaseline: () => this.frozenRowsController.getBaseline(),
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
    });
    this.rowData = managers.rowData;
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
    });
    this.geometry = toReadonlyGeometry(this.geometryService);
    this.geometryService.refresh();
    this.frozenRowsController.captureBaseline();

    this.viewport = this.viewportController;
    this.frozenRows = this.frozenRowsController;
    this.rows = new RowsController({ rowData: this.rowData, slotPool: this.slotPool });
    this.cells = new CellsController({ rowData: this.rowData, geometry: this.geometry });
    this.edit = new EditController({
      batcher: this.batcher,
      editManager: this.editManager,
      columnModel: this.columnModel,
      selection: this.selection,
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
      refreshSlotData: () => this.slotPool.refreshAllSlots(),
    });
    this.columns = new ColumnsController({
      config: this.config,
      batcher: this.batcher,
      columnModel: this.columnModel,
      selection: this.selection,
      editManager: this.editManager,
      sortFilter: this.sortFilter,
      rowData: this.rowData,
      view: this.view,
      getGeometry: () => this.geometryService,
      getColumnLayout: () => this.geometry.getColumnLayout(),
      refreshGeometry: () => this.viewportController.refreshGeometry(),
      retainEditColumn: (columnId) => this.retainEditColumn(columnId),
      reloadAfterSchemaChange: () => this.refresh(),
    });
    this.rowDrag = new RowDragController({
      config: this.config,
      rowData: this.rowData,
      slotPool: this.slotPool,
      highlight: this.highlight,
    });
    this.input = new InputHandler(this);
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
   * visible window is re-fetched.
   */
  async refreshFromTransaction(): Promise<void> {
    await this.rowData.refreshFromTransaction();
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
