import { GridCore } from '@gp-grid/core';
import type {
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  ColumnLayoutMode,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  DataSource,
  FreezeRowsOptions,
  FrozenRowsState,
  GridLabelOverrides,
  HighlightingOptions,
  RowDragEndEvent,
  RowLoadingOptions,
  RowId,
} from '@gp-grid/core';

export interface BuildGridCoreInputs<TData> {
  columns: ColumnDefinition[];
  dataSource: DataSource<TData>;
  rowHeight: number;
  headerHeight: number;
  overscan: number;
  columnOverscan: number | undefined;
  freezeRows: FreezeRowsOptions | undefined;
  columnLayout: ColumnLayoutMode | undefined;
  maxFlingVelocity: number | undefined;
  rowLoading: RowLoadingOptions | undefined;
  sortingEnabled: boolean;
  highlighting: HighlightingOptions<TData> | undefined;
  getRowId: ((row: TData) => RowId) | undefined;
  rowDragEntireRow: boolean;
  labels: GridLabelOverrides | undefined;
}

export interface BuildGridCoreEmitters<TData> {
  onRowDragEnd: (event: RowDragEndEvent) => void;
  onCellValueChanged: (event: CellValueChangedEvent<TData>) => void;
  onWriteRejected: (event: CellWriteRejectedEvent) => void;
  onColumnResized: (event: ColumnResizedEvent) => void;
  onColumnMoved: (event: ColumnMovedEvent) => void;
  onColumnPinned: (event: ColumnPinnedEvent) => void;
  onFrozenRowsChanged: (state: FrozenRowsState) => void;
}

export const buildGridCore = <TData>(
  inputs: BuildGridCoreInputs<TData>,
  emitters: BuildGridCoreEmitters<TData>,
): GridCore<TData> => {
  const cellValueChanged = inputs.getRowId === undefined
    ? undefined
    : emitters.onCellValueChanged;

  return new GridCore<TData>({
    columns: inputs.columns,
    dataSource: inputs.dataSource,
    rowHeight: inputs.rowHeight,
    headerHeight: inputs.headerHeight,
    overscan: inputs.overscan,
    columnOverscan: inputs.columnOverscan,
    freezeRows: inputs.freezeRows,
    columnLayout: inputs.columnLayout,
    maxFlingVelocity: inputs.maxFlingVelocity,
    rowLoading: inputs.rowLoading,
    sortingEnabled: inputs.sortingEnabled,
    highlighting: inputs.highlighting,
    getRowId: inputs.getRowId,
    rowDragEntireRow: inputs.rowDragEntireRow,
    labels: inputs.labels,
    onRowDragEnd: emitters.onRowDragEnd,
    onCellValueChanged: cellValueChanged,
    onWriteRejected: emitters.onWriteRejected,
    onColumnResized: emitters.onColumnResized,
    onColumnMoved: emitters.onColumnMoved,
    onColumnPinned: emitters.onColumnPinned,
    onFrozenRowsChanged: emitters.onFrozenRowsChanged,
  });
};
