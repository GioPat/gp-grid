// packages/core/src/grid-core-managers.ts
// Manager construction for GridCore. Extracted from grid-core.ts to keep
// the orchestrator focused on public API and lifecycle — the factory owns
// the subsystem wiring (per-manager deps + instruction-forwarding).

import { SelectionManager } from "./selection";
import { FillManager } from "./fill";
import { SlotPoolManager } from "./slot-pool";
import { EditManager } from "./edit-manager";
import {
  HighlightManager,
  InstructionBatcher,
  ScrollVirtualizationManager,
  SortFilterManager,
  ViewportState,
} from "./managers";
import { RowDataManager } from "./managers/row-data-manager";
import { ViewSync } from "./grid-core-view-sync";
import type { GridCoreConfig } from "./grid-core-config";
import type { CellValue, ColumnDefinition } from "./types";

export interface GridManagersDeps<TData> {
  batcher: InstructionBatcher;
  config: GridCoreConfig<TData>;
  // Columns and their positions are owned (and replaced) by GridCore.
  getColumns: () => ColumnDefinition[];
  getColumnPositions: () => number[];
}

export interface GridManagers<TData> {
  rowData: RowDataManager<TData>;
  selection: SelectionManager;
  highlight: HighlightManager<TData> | null;
  fill: FillManager;
  scrollVirtualization: ScrollVirtualizationManager;
  viewport: ViewportState;
  slotPool: SlotPoolManager;
  editManager: EditManager;
  sortFilter: SortFilterManager<TData>;
  view: ViewSync<TData>;
}

export const buildGridManagers = <TData>(
  deps: GridManagersDeps<TData>,
): GridManagers<TData> => {
  const { batcher, config, getColumns } = deps;
  const getRowHeight = (): number => config.rowHeight;
  const getHeaderHeight = (): number => config.headerHeight;
  const getOverscan = (): number => config.overscan;

  // Managers cross-reference each other through lazy arrow-fn getters.
  // Forward-declare the late ones so callbacks resolve at call time, not at
  // construction; none of them run before buildGridManagers returns.
  let viewport!: ViewportState;
  let rowData!: RowDataManager<TData>;
  const getTotalRows = (): number => rowData.getTotalRows();
  const getCachedRows = (): Map<number, TData> => rowData.getCachedRows();
  const getCellValue = (row: number, col: number): CellValue =>
    rowData.getCellValue(row, col);
  const setCellValue = (row: number, col: number, value: CellValue): void => {
    rowData.setCellValue(row, col, value);
  };

  const scrollVirtualization = new ScrollVirtualizationManager({
    getRowHeight,
    getHeaderHeight,
    getTotalRows,
    getScrollTop: () => viewport.getScrollTop(),
    getViewportHeight: () => viewport.getViewportHeight(),
  });
  viewport = new ViewportState(() => scrollVirtualization.getScrollRatio());

  // selection.onInstruction closes over `highlight`, populated below.
  let highlight: HighlightManager<TData> | null = null;

  const selection = new SelectionManager({
    getRowCount: getTotalRows,
    getColumnCount: () => getColumns().length,
    getCellValue,
    getRowData: (row) => getCachedRows().get(row),
    getColumn: (col) => getColumns()[col],
    setCellValue,
  });
  selection.onInstruction((instruction) => {
    batcher.emit(instruction);
    highlight?.onSelectionChange();
  });

  if (config.highlighting) {
    highlight = new HighlightManager<TData>(
      {
        getActiveCell: () => selection.getActiveCell(),
        getSelectionRange: () => selection.getSelectionRange(),
        getColumn: (colIndex) => getColumns()[colIndex],
      },
      config.highlighting,
    );
    highlight.onInstruction((instruction) => batcher.emit(instruction));
  }

  const fill = new FillManager({
    getRowCount: getTotalRows,
    getColumnCount: () => getColumns().length,
    getCellValue,
    getColumn: (col) => getColumns()[col],
    setCellValue,
  });
  fill.onInstruction((instruction) => batcher.emit(instruction));

  const slotPool = new SlotPoolManager({
    getRowHeight,
    getHeaderHeight,
    getOverscan,
    getScrollTop: () => viewport.getScrollTop(),
    getViewportHeight: () => viewport.getViewportHeight(),
    getTotalRows,
    getScrollRatio: () => scrollVirtualization.getScrollRatio(),
    getVirtualContentHeight: () => scrollVirtualization.getVirtualContentHeight(),
    getRowData: (rowIndex) => getCachedRows().get(rowIndex),
  });
  slotPool.onBatchInstruction((instructions) => batcher.emitBatch(instructions));

  const editManager = new EditManager({
    getColumn: (col) => getColumns()[col],
    getCellValue,
    setCellValue,
    onCommit: (row) => slotPool.updateSlot(row),
  });
  editManager.onInstruction((instruction) => batcher.emit(instruction));

  const sortFilter = new SortFilterManager<TData>({
    getColumns,
    isSortingEnabled: () => config.sortingEnabled,
    getCachedRows,
    onSortFilterChange: async () => {
      await rowData.loadInitial();
      // Filtered/sorted results are a new view — start from the top.
      viewport.resetScrollTop();
      batcher.start();
      try {
        batcher.emit({ type: "SCROLL_TO", scrollTop: 0 });
        view.reconcile();
      } finally {
        batcher.flush();
      }
    },
    onDataRefreshed: () => {
      // Handled in onSortFilterChange via batcher.start/flush
      // so all UI updates arrive as a single atomic batch.
    },
  });
  sortFilter.onInstruction((instruction) => batcher.emit(instruction));

  const view = new ViewSync<TData>({
    batcher,
    scrollVirtualization,
    slotPool,
    viewport,
    sortFilter,
    highlight,
    overscan: config.overscan,
    getColumns,
    getColumnPositions: deps.getColumnPositions,
    getTotalRows,
  });

  rowData = new RowDataManager<TData>({
    dataSource: config.dataSource,
    rowLoading: config.rowLoading,
    batcher,
    getColumns,
    getSortModel: () => sortFilter.getSortModel(),
    getFilterModel: () => sortFilter.getFilterModel(),
    getRowHeight,
    getOverscan,
    getScrollTop: () => viewport.getScrollTop(),
    getViewportHeight: () => viewport.getViewportHeight(),
    onCellValueChanged: config.onCellValueChanged,
    getRowId: config.getRowId,
    onRowsLoaded: (totalRowsChanged) => view.syncVisibleRows(totalRowsChanged),
  });

  return {
    rowData,
    selection,
    highlight,
    fill,
    scrollVirtualization,
    viewport,
    slotPool,
    editManager,
    sortFilter,
    view,
  };
};
