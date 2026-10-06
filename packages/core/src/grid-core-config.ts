// packages/core/src/grid-core-config.ts
// Resolves GridCoreOptions into the immutable configuration that GridCore
// and its managers read for the grid's lifetime. Defaults and option
// cross-checks live here, once, instead of in the GridCore constructor.

import type {
  AutoFitOptions,
  ColumnGroupLimits,
  FreezeRowsOptions,
  GridCoreOptions,
} from "./types";
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

/** Widest width a column fit sets by default. */
export const DEFAULT_MAX_FIT_COLUMN_WIDTH = 600;

/** Default tallest fitted or resized row, in multiples of `rowHeight`. */
const DEFAULT_MAX_ROW_HEIGHT_FACTOR = 10;

/** Budgets of a column-group hierarchy when `columnGroupLimits` omits them. */
export const DEFAULT_COLUMN_GROUP_LIMITS: Readonly<Required<ColumnGroupLimits>> = {
  maxDepth: 64,
  maxNodes: 100_000,
  maxFragments: 100_000,
};

const NO_BAND_HEIGHTS: readonly number[] = [];

type DefaultedOption =
  | "headerHeight"
  | "overscan"
  | "maxFlingVelocity"
  | "sortingEnabled"
  | "rowDragEntireRow"
  | "rowResize"
  | "columnLayout"
  | "columnOverscan"
  | "freezeRows"
  | "autoFit"
  | "columnGroupLimits"
  | "headerBandHeights"
  | "labels";

/** `Invalid <path>: <value>`, the message of every rejected option. */
const invalidOption = (path: string, value: unknown): RangeError =>
  new RangeError(`Invalid ${path}: ${value}`);

const isPositiveSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** An object-valued option, `{}` when omitted; any other value throws. */
const readOptionObject = <T extends object>(value: T | undefined, path: string): Partial<T> => {
  if (value === undefined) return {};
  if (typeof value === "object" && value !== null) return value;
  throw invalidOption(path, value);
};

const readCount = (value: unknown, field: string): number => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw invalidOption(`freezeRows.${field}`, value);
};

const readSuffixHeight = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  throw invalidOption("freezeRows.minSuffixHeight", value);
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
  if (typeof value !== "object" || value === null) throw invalidOption("freezeRows", value);
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

const readFitSize = (value: unknown, field: string, fallback: number): number => {
  if (value === undefined) return fallback;
  if (isPositiveSize(value)) return value;
  throw invalidOption(`autoFit.${field}`, value);
};

/** Validate `autoFit` into its full triple against the grid's `rowHeight`. */
export const resolveAutoFitOptions = (
  value: AutoFitOptions | undefined,
  rowHeight: number,
): Readonly<Required<AutoFitOptions>> => {
  const options = readOptionObject(value, "autoFit");
  const minRowHeight = readFitSize(options.minRowHeight, "minRowHeight", rowHeight);
  const maxRowHeight = readFitSize(
    options.maxRowHeight,
    "maxRowHeight",
    DEFAULT_MAX_ROW_HEIGHT_FACTOR * rowHeight,
  );
  if (maxRowHeight < minRowHeight) throw invalidOption("autoFit.maxRowHeight", maxRowHeight);
  return {
    maxColumnWidth: readFitSize(
      options.maxColumnWidth,
      "maxColumnWidth",
      DEFAULT_MAX_FIT_COLUMN_WIDTH,
    ),
    minRowHeight,
    maxRowHeight,
  };
};

const readGroupLimit = (value: unknown, field: keyof ColumnGroupLimits): number => {
  if (value === undefined) return DEFAULT_COLUMN_GROUP_LIMITS[field];
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  throw invalidOption(`columnGroupLimits.${field}`, value);
};

/** Validate `columnGroupLimits` into its full triple. */
export const resolveColumnGroupLimits = (
  value: ColumnGroupLimits | undefined,
): Readonly<Required<ColumnGroupLimits>> => {
  const limits = readOptionObject(value, "columnGroupLimits");
  return {
    maxDepth: readGroupLimit(limits.maxDepth, "maxDepth"),
    maxNodes: readGroupLimit(limits.maxNodes, "maxNodes"),
    maxFragments: readGroupLimit(limits.maxFragments, "maxFragments"),
  };
};

const readBandHeight = (value: unknown, band: number): number => {
  if (isPositiveSize(value)) return value;
  throw invalidOption(`headerBandHeights[${band}]`, value);
};

/**
 * Validate `headerBandHeights` into a copy the caller cannot mutate, so the
 * runtime setter shares the option's exact errors.
 */
export const resolveHeaderBandHeights = (
  value: readonly number[] | undefined,
): readonly number[] => {
  if (value === undefined) return NO_BAND_HEIGHTS;
  if (Array.isArray(value)) {
    return Array.from(value, (height: unknown, band) => readBandHeight(height, band));
  }
  throw invalidOption("headerBandHeights", value);
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
  readonly rowResize: boolean;
  readonly columnLayout: ColumnLayoutMode;
  readonly columnOverscan: number;
  readonly freezeRows: Readonly<Required<FreezeRowsOptions>>;
  readonly autoFit: Readonly<Required<AutoFitOptions>>;
  readonly columnGroupLimits: Readonly<Required<ColumnGroupLimits>>;
  readonly headerBandHeights: readonly number[];
  readonly labels: GridLabels;
}

export const resolveGridCoreConfig = <TData>(
  options: GridCoreOptions<TData>,
): GridCoreConfig<TData> => {
  if (options.onCellValueChanged && options.getRowId === undefined) {
    throw new Error("getRowId is required when onCellValueChanged is provided");
  }
  if (isPositiveSize(options.rowHeight) === false) {
    throw invalidOption("rowHeight", options.rowHeight);
  }
  const overscan = options.overscan ?? 3;
  if (!Number.isSafeInteger(overscan) || overscan < 0) {
    throw invalidOption("overscan", overscan);
  }
  const columnOverscan = options.columnOverscan ?? DEFAULT_COLUMN_OVERSCAN;
  if (!Number.isFinite(columnOverscan) || columnOverscan < 0) {
    throw invalidOption("columnOverscan", columnOverscan);
  }
  const freezeRows = resolveFreezeRowsOptions(options.freezeRows);
  const autoFit = resolveAutoFitOptions(options.autoFit, options.rowHeight);
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
    onRowResized: options.onRowResized,
    onColumnMoved: options.onColumnMoved,
    onColumnPinned: options.onColumnPinned,
    onFrozenRowsChanged: options.onFrozenRowsChanged,
    onColumnSchemaRejected: options.onColumnSchemaRejected,
    rowGrouping: options.rowGrouping,
    onRowGroupToggled: options.onRowGroupToggled,
    onRowGroupingRejected: options.onRowGroupingRejected,
    headerHeight: options.headerHeight ?? options.rowHeight,
    headerBandHeights: resolveHeaderBandHeights(options.headerBandHeights),
    columnGroups: options.columnGroups,
    columnGroupLimits: resolveColumnGroupLimits(options.columnGroupLimits),
    overscan,
    columnOverscan,
    freezeRows,
    autoFit,
    measurementHost: options.measurementHost,
    labels: resolveGridLabels(options.labels),
    maxFlingVelocity: options.maxFlingVelocity ??
      (DEFAULT_FLING_ROWS_PER_SECOND * options.rowHeight) / 1000,
    sortingEnabled: options.sortingEnabled ?? true,
    rowDragEntireRow: options.rowDragEntireRow ?? false,
    rowResize: options.rowResize ?? false,
    columnLayout: options.columnLayout ?? "fit",
  };
};
