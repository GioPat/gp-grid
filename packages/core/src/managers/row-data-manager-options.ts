// packages/core/src/managers/row-data-manager-options.ts

import type {
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  FilterModel,
  RowGrouping,
  RowGroupingRejection,
  RowId,
  RowLoadingOptions,
  SortModel,
} from "../types";
import type { InstructionBatcher } from "./instruction-batcher";
import type { RowLoadContext, RowPageBudgetInput } from "./row-window-loader";

export interface RowDataManagerOptions<TData> {
  dataSource: DataSource<TData>;
  rowLoading: RowLoadingOptions | undefined;
  batcher: InstructionBatcher;
  getColumns: () => ColumnDefinition[];
  getSortModel: () => SortModel[];
  getFilterModel: () => FilterModel;
  /** Overscanned half-open row window from the geometry service. */
  getRowWindow: () => { start: number; end: number };
  /** Exact half-open visible row window from the geometry service. */
  getVisibleRowWindow: () => { start: number; end: number };
  /** Finite row estimate for the first load, while the row axis is still empty. */
  getBootstrapRowCount: () => number;
  /** Capacity inputs for C2's cache predicate; never reads the region layout. */
  getPageBudgetInput: () => RowPageBudgetInput;
  /** Windows and the published C9 layout for the load being computed. */
  getLoadContext: () => RowLoadContext;
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  getRowId?: (row: TData) => RowId;
  /** Called when a write is refused because the source is read-only. */
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
  /** Groups the flat rows of every full load (D7). */
  rowGrouping?: RowGrouping | null;
  onRowGroupingRejected?: (rejection: RowGroupingRejection) => void;
  /**
   * A row window arrived from a fire-and-forget load (scroll-triggered), so
   * nobody is awaiting it: the view must be synced from here.
   */
  onRowsLoaded: (totalRowsChanged: boolean) => void;
}
