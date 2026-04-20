// packages/core/src/grid-core-emitters.ts
// Pure instruction-emission helpers shared by GridCore's column, data,
// and layout operations. Keeps the orchestrator thin by lifting the
// manager-coordination glue out of method bodies.

import type { SlotPoolManager } from "./slot-pool";
import type {
  InstructionBatcher,
  ScrollVirtualizationManager,
  SortFilterManager,
  ViewportState,
} from "./managers";
import type { ColumnDefinition } from "./types";

export interface ContentSizeDeps {
  batcher: InstructionBatcher;
  scrollVirtualization: ScrollVirtualizationManager;
  slotPool: SlotPoolManager;
  viewport: ViewportState;
  columnPositions: number[];
}

export const emitContentSize = (deps: ContentSizeDeps): void => {
  const width = deps.columnPositions.at(-1) ?? 0;
  deps.scrollVirtualization.updateContentSize();
  deps.batcher.emit({
    type: "SET_CONTENT_SIZE",
    width,
    height: deps.scrollVirtualization.getVirtualHeight(),
    viewportWidth: deps.viewport.getViewportWidth(),
    viewportHeight: deps.viewport.getViewportHeight(),
    rowsWrapperOffset: deps.slotPool.getRowsWrapperOffset(),
  });
};

export interface HeadersDeps<TData> {
  batcher: InstructionBatcher;
  sortFilter: SortFilterManager<TData>;
  columns: ColumnDefinition[];
}

export const emitHeaders = <TData>(deps: HeadersDeps<TData>): void => {
  const sortInfoMap = deps.sortFilter.getSortInfoMap();
  for (let i = 0; i < deps.columns.length; i++) {
    const column = deps.columns[i]!;
    const colId = column.colId ?? column.field;
    const sortInfo = sortInfoMap.get(colId);
    deps.batcher.emit({
      type: "UPDATE_HEADER",
      colIndex: i,
      column,
      sortDirection: sortInfo?.direction,
      sortIndex: sortInfo?.index,
      hasFilter: deps.sortFilter.hasActiveFilter(colId),
    });
  }
};

export interface VisibleRangeDeps {
  batcher: InstructionBatcher;
  scrollVirtualization: ScrollVirtualizationManager;
  slotPool: SlotPoolManager;
}

export const emitVisibleRange = (deps: VisibleRangeDeps): void => {
  const visibleRange = deps.scrollVirtualization.getVisibleRowRange();
  deps.batcher.emit({
    type: "UPDATE_VISIBLE_RANGE",
    start: visibleRange.start,
    end: visibleRange.end,
    rowsWrapperOffset: deps.slotPool.getRowsWrapperOffset(),
  });
};
