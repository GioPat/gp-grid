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

const readFitSize = (value: unknown, field: string, fallback: number): number => {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new RangeError(`Invalid autoFit.${field}: ${value}`);
};

/** Validate `autoFit` into its full triple against the grid's `rowHeight`. */
export const resolveAutoFitOptions = (
  value: AutoFitOptions | undefined,
  rowHeight: number,
): Readonly<Required<AutoFitOptions>> => {
  if (value !== undefined && (typeof value !== "object" || value === null)) {
    throw new RangeError(`Invalid autoFit: ${value}`);
  }
  const minRowHeight = readFitSize(value?.minRowHeight, "minRowHeight", rowHeight);
  const maxRowHeight = readFitSize(
    value?.maxRowHeight,
    "maxRowHeight",
    DEFAULT_MAX_ROW_HEIGHT_FACTOR * rowHeight,
  );
  if (maxRowHeight < minRowHeight) {
    throw new RangeError(`Invalid autoFit.maxRowHeight: ${maxRowHeight}`);
  }
  return {
    maxColumnWidth: readFitSize(
      value?.maxColumnWidth,
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
  throw new RangeError(`Invalid columnGroupLimits.${field}: ${value}`);
};

/** Validate `columnGroupLimits` into its full triple. */
export const resolveColumnGroupLimits = (
  value: ColumnGroupLimits | undefined,
): Readonly<Required<ColumnGroupLimits>> => {
  if (value !== undefined && (typeof value !== "object" || value === null)) {
    throw new RangeError(`Invalid columnGroupLimits: ${value}`);
  }
  return {
    maxDepth: readGroupLimit(value?.maxDepth, "maxDepth"),
    maxNodes: readGroupLimit(value?.maxNodes, "maxNodes"),
    maxFragments: readGroupLimit(value?.maxFragments, "maxFragments"),
  };
};

const readBandHeight = (value: unknown, band: number): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new RangeError(`Invalid headerBandHeights[${band}]: ${value}`);
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
  throw new RangeError(`Invalid headerBandHeights: ${value}`);
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
