// packages/core/src/grid-core-config.ts
// Resolves GridCoreOptions into the immutable configuration that GridCore
// and its managers read for the grid's lifetime. Defaults and option
// cross-checks live here, once, instead of in the GridCore constructor.

import type { FreezeRowsOptions, GridCoreOptions } from "./types";
import type { ColumnLayoutMode } from "./types/geometry";
import {
  DEFAULT_MAX_FROZEN_ROWS,
  DEFAULT_MIN_SUFFIX_HEIGHT,
} from "./geometry";
import { type GridLabels, resolveGridLabels } from "./i18n";

// Default momentum ceiling for the synthetic touch scroller, expressed in
// rows per second and converted to logical px/ms via the row height.
const DEFAULT_FLING_ROWS_PER_SECOND = 20_000;

/** CSS px of center window kept mounted past each clip edge by default. */
export const DEFAULT_COLUMN_OVERSCAN = 240;

type DefaultedOption =
  | "headerHeight"
  | "overscan"
  | "maxFlingVelocity"
  | "sortingEnabled"
  | "rowDragEntireRow"
  | "columnLayout"
  | "columnOverscan"
  | "freezeRows"
  | "labels";

const invalidFreezeRows = (value: unknown): RangeError =>
  new RangeError(`Invalid freezeRows: ${value}`);

const invalidFreezeRowsField = (field: string, value: unknown): RangeError =>
  new RangeError(`Invalid freezeRows.${field}: ${value}`);

const readCount = (value: unknown, field: string): number => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw invalidFreezeRowsField(field, value);
};

const readSuffixHeight = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  throw invalidFreezeRowsField("minSuffixHeight", value);
};

/**
 * Validate a `freezeRows` option into its full triple. `undefined` resolves
 * the defaults, so a runtime setter shares the option's exact errors.
 */
export const resolveFreezeRowsOptions = (
  value: FreezeRowsOptions | undefined,
): Readonly<Required<FreezeRowsOptions>> => {
  if (value === undefined) {
    return {
      count: 0,
      maxCount: DEFAULT_MAX_FROZEN_ROWS,
      minSuffixHeight: DEFAULT_MIN_SUFFIX_HEIGHT,
    };
  }
  if (typeof value !== "object" || value === null) throw invalidFreezeRows(value);
  return {
    count: readCount(value.count, "count"),
    maxCount: value.maxCount === undefined
      ? DEFAULT_MAX_FROZEN_ROWS
      : readCount(value.maxCount, "maxCount"),
    minSuffixHeight: value.minSuffixHeight === undefined
      ? DEFAULT_MIN_SUFFIX_HEIGHT
      : readSuffixHeight(value.minSuffixHeight),
  };
};

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
  readonly columnLayout: ColumnLayoutMode;
  readonly columnOverscan: number;
  readonly freezeRows: Readonly<Required<FreezeRowsOptions>>;
  readonly labels: GridLabels;
}

export const resolveGridCoreConfig = <TData>(
  options: GridCoreOptions<TData>,
): GridCoreConfig<TData> => {
  if (options.onCellValueChanged && options.getRowId === undefined) {
    throw new Error("getRowId is required when onCellValueChanged is provided");
  }
  if (!Number.isFinite(options.rowHeight) || options.rowHeight <= 0) {
    throw new RangeError(`Invalid rowHeight: ${options.rowHeight}`);
  }
  const overscan = options.overscan ?? 3;
  if (!Number.isSafeInteger(overscan) || overscan < 0) {
    throw new RangeError(`Invalid overscan: ${overscan}`);
  }
  const columnOverscan = options.columnOverscan ?? DEFAULT_COLUMN_OVERSCAN;
  if (!Number.isFinite(columnOverscan) || columnOverscan < 0) {
    throw new RangeError(`Invalid columnOverscan: ${columnOverscan}`);
  }
  const freezeRows = resolveFreezeRowsOptions(options.freezeRows);
  return {
    dataSource: options.dataSource,
    rowHeight: options.rowHeight,
    rowLoading: options.rowLoading,
    getRowId: options.getRowId,
    highlighting: options.highlighting,
    onCellValueChanged: options.onCellValueChanged,
    onWriteRejected: options.onWriteRejected,
    onRowDragEnd: options.onRowDragEnd,
    onColumnResized: options.onColumnResized,
    onColumnMoved: options.onColumnMoved,
    onColumnPinned: options.onColumnPinned,
    onFrozenRowsChanged: options.onFrozenRowsChanged,
    headerHeight: options.headerHeight ?? options.rowHeight,
    overscan,
    columnOverscan,
    freezeRows,
    labels: resolveGridLabels(options.labels),
    maxFlingVelocity: options.maxFlingVelocity ??
      (DEFAULT_FLING_ROWS_PER_SECOND * options.rowHeight) / 1000,
    sortingEnabled: options.sortingEnabled ?? true,
    rowDragEntireRow: options.rowDragEntireRow ?? false,
    columnLayout: options.columnLayout ?? "fit",
  };
};
