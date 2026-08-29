// packages/core/src/grid-core-config.ts
// Resolves GridCoreOptions into the immutable configuration that GridCore
// and its managers read for the grid's lifetime. Defaults and option
// cross-checks live here, once, instead of in the GridCore constructor.

import type { GridCoreOptions } from "./types";

// Default momentum ceiling for the synthetic touch scroller, expressed in
// rows per second and converted to logical px/ms via the row height.
const DEFAULT_FLING_ROWS_PER_SECOND = 20_000;

type DefaultedOption =
  | "headerHeight"
  | "overscan"
  | "maxFlingVelocity"
  | "sortingEnabled"
  | "rowDragEntireRow";

/**
 * GridCoreOptions with defaults applied. `columns` is excluded: it is the
 * one option that changes after construction (see GridCore.setColumns).
 */
export interface GridCoreConfig<TData>
  extends Readonly<Omit<GridCoreOptions<TData>, "columns" | DefaultedOption>> {
  readonly headerHeight: number;
  readonly overscan: number;
  readonly maxFlingVelocity: number;
  readonly sortingEnabled: boolean;
  readonly rowDragEntireRow: boolean;
}

export const resolveGridCoreConfig = <TData>(
  options: GridCoreOptions<TData>,
): GridCoreConfig<TData> => {
  if (options.onCellValueChanged && options.getRowId === undefined) {
    throw new Error("getRowId is required when onCellValueChanged is provided");
  }
  return {
    dataSource: options.dataSource,
    rowHeight: options.rowHeight,
    rowLoading: options.rowLoading,
    getRowId: options.getRowId,
    highlighting: options.highlighting,
    onCellValueChanged: options.onCellValueChanged,
    onRowDragEnd: options.onRowDragEnd,
    onColumnResized: options.onColumnResized,
    onColumnMoved: options.onColumnMoved,
    headerHeight: options.headerHeight ?? options.rowHeight,
    overscan: options.overscan ?? 3,
    maxFlingVelocity: options.maxFlingVelocity ??
      (DEFAULT_FLING_ROWS_PER_SECOND * options.rowHeight) / 1000,
    sortingEnabled: options.sortingEnabled ?? true,
    rowDragEntireRow: options.rowDragEntireRow ?? false,
  };
};
