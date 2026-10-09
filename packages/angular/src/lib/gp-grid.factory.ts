import { GridCore, createDomMeasurementHost } from '@gp-grid/core';
import type {
  AutoFitOptions,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupLimits,
  ColumnLayoutMode,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnSchemaError,
  DataSource,
  FreezeRowsOptions,
  FrozenRowsState,
  GridLabelOverrides,
  HighlightingOptions,
  RowDragEndEvent,
  RowGrouping,
  RowGroupingRejection,
  RowGroupToggledEvent,
  RowLoadingOptions,
  RowId,
  RowResizedEvent,
} from '@gp-grid/core';

export interface BuildGridCoreInputs<TData> {
  columns: ColumnDefinition[];
  columnGroups: readonly ColumnGroupChild[] | undefined;
  columnGroupLimits: ColumnGroupLimits | undefined;
  dataSource: DataSource<TData>;
  rowHeight: number;
  headerHeight: number;
  headerBandHeights: readonly number[] | undefined;
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
  rowResize: boolean;
  autoFit: AutoFitOptions | undefined;
  rowGrouping: RowGrouping | null | undefined;
  /** Grid root the fit commands measure; `null` on the server, where no host is built. */
  measureRoot: (() => HTMLElement | null) | null;
}

export interface BuildGridCoreEmitters<TData> {
  onRowDragEnd: (event: RowDragEndEvent) => void;
  onCellValueChanged: (event: CellValueChangedEvent<TData>) => void;
  onWriteRejected: (event: CellWriteRejectedEvent) => void;
  onColumnResized: (event: ColumnResizedEvent) => void;
  onRowResized: (event: RowResizedEvent) => void;
  onColumnMoved: (event: ColumnMovedEvent) => void;
  onColumnPinned: (event: ColumnPinnedEvent) => void;
  onFrozenRowsChanged: (state: FrozenRowsState) => void;
  onColumnSchemaRejected: (error: ColumnSchemaError) => void;
  onRowGroupToggled: (event: RowGroupToggledEvent) => void;
  onRowGroupingRejected: (rejection: RowGroupingRejection) => void;
}

export const buildGridCore = <TData>(
  inputs: BuildGridCoreInputs<TData>,
  emitters: BuildGridCoreEmitters<TData>,
): GridCore<TData> => {
  const cellValueChanged = inputs.getRowId === undefined
    ? undefined
    : emitters.onCellValueChanged;
  const measurementHost = inputs.measureRoot === null
    ? undefined
    : createDomMeasurementHost(inputs.measureRoot);

  return new GridCore<TData>({
    columns: inputs.columns,
    columnGroups: inputs.columnGroups,
    columnGroupLimits: inputs.columnGroupLimits,
    dataSource: inputs.dataSource,
    rowHeight: inputs.rowHeight,
    headerHeight: inputs.headerHeight,
    headerBandHeights: inputs.headerBandHeights,
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
    rowResize: inputs.rowResize,
    autoFit: inputs.autoFit,
    rowGrouping: inputs.rowGrouping,
    measurementHost,
    onRowDragEnd: emitters.onRowDragEnd,
    onCellValueChanged: cellValueChanged,
    onWriteRejected: emitters.onWriteRejected,
    onColumnResized: emitters.onColumnResized,
    onRowResized: emitters.onRowResized,
    onColumnMoved: emitters.onColumnMoved,
    onColumnPinned: emitters.onColumnPinned,
    onFrozenRowsChanged: emitters.onFrozenRowsChanged,
    onColumnSchemaRejected: emitters.onColumnSchemaRejected,
    onRowGroupToggled: emitters.onRowGroupToggled,
    onRowGroupingRejected: emitters.onRowGroupingRejected,
  });
};
