import { GridCore } from '@gp-grid/core';
import type {
  CellValueChangedEvent,
  ColumnDefinition,
  DataSource,
  HighlightingOptions,
  RowId,
  RowGroupingOptions,
} from '@gp-grid/core';

export interface BuildGridCoreInputs<TData> {
  columns: ColumnDefinition[];
  dataSource: DataSource<TData>;
  rowHeight: number;
  headerHeight: number;
  overscan: number;
  sortingEnabled: boolean;
  highlighting: HighlightingOptions<TData> | undefined;
  getRowId: ((row: TData) => RowId) | undefined;
  rowDragEntireRow: boolean;
  rowGrouping: RowGroupingOptions | undefined;
}

export interface BuildGridCoreEmitters<TData> {
  onRowDragEnd: (source: number, target: number) => void;
  onCellValueChanged: (event: CellValueChangedEvent<TData>) => void;
  onColumnResized: (colIndex: number, newWidth: number) => void;
  onColumnMoved: (fromIndex: number, toIndex: number) => void;
  onRowGroupExpandedChange: (groupKey: string, expanded: boolean) => void;
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
    sortingEnabled: inputs.sortingEnabled,
    highlighting: inputs.highlighting,
    getRowId: inputs.getRowId,
    rowDragEntireRow: inputs.rowDragEntireRow,
    rowGrouping: inputs.rowGrouping,
    onRowDragEnd: emitters.onRowDragEnd,
    onCellValueChanged: cellValueChanged,
    onColumnResized: emitters.onColumnResized,
    onColumnMoved: emitters.onColumnMoved,
    onRowGroupExpandedChange: emitters.onRowGroupExpandedChange,
  });
};
