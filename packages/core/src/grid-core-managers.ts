// packages/core/src/grid-core-managers.ts
// Manager construction for GridCore. Extracted from grid-core.ts to keep
// the orchestrator focused on public API and lifecycle — the factory
// owns the subsystem wiring (per-manager deps + instruction-forwarding).

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
import type {
  CellValue,
  ColumnDefinition,
  HighlightingOptions,
} from "./types";

export interface GridManagersDeps<TData> {
  batcher: InstructionBatcher;
  highlighting: HighlightingOptions<TData> | undefined;
  getColumns: () => ColumnDefinition[];
  getCachedRows: () => Map<number, TData>;
  getTotalRows: () => number;
  getRowHeight: () => number;
  getHeaderHeight: () => number;
  getOverscan: () => number;
  getSortingEnabled: () => boolean;
  getCellValue: (row: number, col: number) => CellValue;
  setCellValue: (row: number, col: number, value: CellValue) => void;
  emitContentSize: () => void;
  emitHeaders: () => void;
  fetchData: () => Promise<void>;
}

export interface GridManagers<TData> {
  selection: SelectionManager;
  highlight: HighlightManager<TData> | null;
  fill: FillManager;
  scrollVirtualization: ScrollVirtualizationManager;
  viewport: ViewportState;
  slotPool: SlotPoolManager;
  editManager: EditManager;
  sortFilter: SortFilterManager<TData>;
}

export const buildGridManagers = <TData>(
  deps: GridManagersDeps<TData>,
): GridManagers<TData> => {
  const { batcher } = deps;

  // scrollVirtualization and viewport cross-reference each other through
  // lazy arrow-fn getters. Forward-declare so both callbacks resolve at
  // call time, not at construction.
  let viewport!: ViewportState;
  const scrollVirtualization = new ScrollVirtualizationManager({
    getRowHeight: deps.getRowHeight,
    getHeaderHeight: deps.getHeaderHeight,
    getTotalRows: deps.getTotalRows,
    getScrollTop: () => viewport.getScrollTop(),
    getViewportHeight: () => viewport.getViewportHeight(),
  });
  viewport = new ViewportState(() => scrollVirtualization.getScrollRatio());

  // selection.onInstruction closes over `highlight`, populated below.
  let highlight: HighlightManager<TData> | null = null;

  const selection = new SelectionManager({
    getRowCount: deps.getTotalRows,
    getColumnCount: () => deps.getColumns().length,
    getCellValue: deps.getCellValue,
    getRowData: (row) => deps.getCachedRows().get(row),
    getColumn: (col) => deps.getColumns()[col],
    setCellValue: deps.setCellValue,
  });
  selection.onInstruction((instruction) => {
    batcher.emit(instruction);
    highlight?.onSelectionChange();
  });

  if (deps.highlighting) {
    highlight = new HighlightManager<TData>(
      {
        getActiveCell: () => selection.getActiveCell(),
        getSelectionRange: () => selection.getSelectionRange(),
        getColumn: (colIndex) => deps.getColumns()[colIndex],
      },
      deps.highlighting,
    );
    highlight.onInstruction((instruction) => batcher.emit(instruction));
  }

  const fill = new FillManager({
    getRowCount: deps.getTotalRows,
    getColumnCount: () => deps.getColumns().length,
    getCellValue: deps.getCellValue,
    getColumn: (col) => deps.getColumns()[col],
    setCellValue: deps.setCellValue,
  });
  fill.onInstruction((instruction) => batcher.emit(instruction));

  const slotPool = new SlotPoolManager({
    getRowHeight: deps.getRowHeight,
    getHeaderHeight: deps.getHeaderHeight,
    getOverscan: deps.getOverscan,
    getScrollTop: () => viewport.getScrollTop(),
    getViewportHeight: () => viewport.getViewportHeight(),
    getTotalRows: deps.getTotalRows,
    getScrollRatio: () => scrollVirtualization.getScrollRatio(),
    getVirtualContentHeight: () => scrollVirtualization.getVirtualContentHeight(),
    getRowData: (rowIndex) => deps.getCachedRows().get(rowIndex),
  });
  slotPool.onBatchInstruction((instructions) => batcher.emitBatch(instructions));

  const editManager = new EditManager({
    getColumn: (col) => deps.getColumns()[col],
    getCellValue: deps.getCellValue,
    setCellValue: deps.setCellValue,
    onCommit: (row) => slotPool.updateSlot(row),
  });
  editManager.onInstruction((instruction) => batcher.emit(instruction));

  const sortFilter = new SortFilterManager<TData>({
    getColumns: deps.getColumns,
    isSortingEnabled: deps.getSortingEnabled,
    getCachedRows: deps.getCachedRows,
    onSortFilterChange: async () => {
      await deps.fetchData();
      highlight?.clearAllCaches();
      // Filtered/sorted results are a new view — start from the top.
      viewport.resetScrollTop();
      batcher.start();
      try {
        batcher.emit({ type: "SCROLL_TO", scrollTop: 0 });
        deps.emitContentSize();
        deps.emitHeaders();
        slotPool.refreshAllSlots();
      } finally {
        batcher.flush();
      }
    },
    onDataRefreshed: () => {
      // Handled in onSortFilterChange via startBatch/flushBatch
      // so all UI updates arrive as a single atomic batch.
    },
  });
  sortFilter.onInstruction((instruction) => batcher.emit(instruction));

  return {
    selection,
    highlight,
    fill,
    scrollVirtualization,
    viewport,
    slotPool,
    editManager,
    sortFilter,
  };
};
