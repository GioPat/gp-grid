// packages/core/src/grid-core-fit.ts
// Pure halves of the fit commands (PRD 007 D3): a host measurement becomes a
// result by testing the layout revision, clamping and listing what was fitted
// or skipped. The controllers resolve targets and apply the changes.

import type { RowId } from "./types";
import type { ColumnWindowSnapshot, ResolvedColumn } from "./types/geometry";
import type {
  ColumnFitEntry,
  ColumnFitResult,
  ColumnFitSkip,
  ColumnMeasurement,
  FitClamp,
  RowFitEntry,
  RowFitResult,
  RowFitSkip,
  RowMeasurement,
} from "./types/measurement";
import { normalizeSize } from "./utils/number-guards";
import { DEFAULT_MIN_COLUMN_WIDTH } from "./geometry/column-widths";

export interface FitLimits {
  readonly min: number;
  readonly max: number;
}

export interface RowFitTarget {
  readonly rowId: RowId;
  readonly rowIndex: number;
}

export interface ColumnFitTarget {
  readonly columnId: string;
  readonly layoutIndex: number;
  readonly limits: FitLimits;
}

export interface RowFitChange extends RowFitTarget {
  readonly height: number;
}

export interface ColumnFitChange {
  readonly columnId: string;
  readonly layoutIndex: number;
  readonly width: number;
}

export interface RowFitInput {
  readonly measurement: RowMeasurement | null;
  /** The core's layout revision; a measurement under another one is stale. */
  readonly layoutRevision: number;
  readonly targets: readonly RowFitTarget[];
  readonly skipped: readonly RowFitSkip[];
  readonly limits: FitLimits;
  /** Current height of a row, to tell an applied fit from an unchanged one. */
  readonly heightOf: (rowIndex: number) => number;
}

export interface ColumnFitInput {
  readonly measurement: ColumnMeasurement | null;
  readonly layoutRevision: number;
  readonly targets: readonly ColumnFitTarget[];
  readonly skipped: readonly ColumnFitSkip[];
  readonly widthOf: (layoutIndex: number) => number;
}

export interface RowFitOutcome {
  readonly result: RowFitResult;
  /** Rows whose height the fit changes; each fires one `onRowResized`. */
  readonly changes: readonly RowFitChange[];
}

export interface ColumnFitOutcome {
  readonly result: ColumnFitResult;
  /** Columns whose width the fit changes; each fires one `onColumnResized`. */
  readonly changes: readonly ColumnFitChange[];
}

/** Clamp into `[min, max]`; a maximum below the minimum wins, as in a drag. */
export const clampFitSize = (
  size: number,
  limits: FitLimits,
): { value: number; clamped: FitClamp } => {
  if (size > limits.max) return { value: limits.max, clamped: "max" };
  const min = Math.min(limits.min, limits.max);
  if (size < min) return { value: min, clamped: "min" };
  return { value: size, clamped: null };
};

export const unsupportedRowFit = (skipped: readonly RowFitSkip[] = []): RowFitResult => ({
  status: "unsupported",
  consideredColumns: 0,
  rows: [],
  skipped,
});

export const unsupportedColumnFit = (
  skipped: readonly ColumnFitSkip[] = [],
): ColumnFitResult => ({
  status: "unsupported",
  scope: "rendered",
  consideredRows: 0,
  columns: [],
  skipped,
});

export const resolveRowFit = (input: RowFitInput): RowFitOutcome => {
  const { measurement } = input;
  if (measurement === null) return { result: unsupportedRowFit(input.skipped), changes: [] };
  const { consideredColumns } = measurement;
  if (measurement.layoutRevision !== input.layoutRevision) {
    return {
      result: { status: "stale", consideredColumns, rows: [], skipped: input.skipped },
      changes: [],
    };
  }
  const rows: RowFitEntry[] = [];
  const skipped = [...input.skipped];
  const changes: RowFitChange[] = [];
  for (const target of input.targets) {
    // A zero or invalid box is an element that is not laid out.
    const measured = normalizeSize(measurement.heights.get(target.rowIndex) ?? 0);
    if (measured === 0) {
      skipped.push({ rowId: target.rowId, reason: "not-mounted" });
      continue;
    }
    const { value, clamped } = clampFitSize(measured, input.limits);
    rows.push({ rowId: target.rowId, height: value, clamped });
    if (value !== input.heightOf(target.rowIndex)) changes.push({ ...target, height: value });
  }
  const status = changes.length > 0 ? "applied" : "unchanged";
  return { result: { status, consideredColumns, rows, skipped }, changes };
};

export const resolveColumnFit = (input: ColumnFitInput): ColumnFitOutcome => {
  const { measurement } = input;
  if (measurement === null) return { result: unsupportedColumnFit(input.skipped), changes: [] };
  const { consideredRows } = measurement;
  if (measurement.layoutRevision !== input.layoutRevision) {
    return {
      result: { status: "stale", scope: "rendered", consideredRows, columns: [], skipped: input.skipped },
      changes: [],
    };
  }
  const columns: ColumnFitEntry[] = [];
  const skipped = [...input.skipped];
  const changes: ColumnFitChange[] = [];
  for (const target of input.targets) {
    const measured = normalizeSize(measurement.widths.get(target.layoutIndex) ?? 0);
    if (measured === 0) {
      skipped.push({ columnId: target.columnId, reason: "not-mounted" });
      continue;
    }
    const { value, clamped } = clampFitSize(Math.ceil(measured), target.limits);
    columns.push({ columnId: target.columnId, width: value, clamped });
    if (value !== input.widthOf(target.layoutIndex)) {
      changes.push({ columnId: target.columnId, layoutIndex: target.layoutIndex, width: value });
    }
  }
  const status = changes.length > 0 ? "applied" : "unchanged";
  return { result: { status, scope: "rendered", consideredRows, columns, skipped }, changes };
};

export interface FitTargets<TTarget, TSkip> {
  readonly targets: readonly TTarget[];
  readonly skipped: readonly TSkip[];
}

const columnFitLimits = (column: ResolvedColumn, maxColumnWidth: number): FitLimits => ({
  min: column.column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH,
  max: Math.min(column.column.maxWidth ?? Number.POSITIVE_INFINITY, maxColumnWidth),
});

/**
 * Mounted displayed columns of the window by id: every one when `columnIds`
 * is omitted, otherwise the named ones, the rest skipped with their reason.
 */
export const resolveColumnFitTargets = (
  columnWindow: ColumnWindowSnapshot,
  columnIds: readonly string[] | undefined,
  isKnown: (columnId: string) => boolean,
  maxColumnWidth: number,
): FitTargets<ColumnFitTarget, ColumnFitSkip> => {
  const mounted = new Map<string, ResolvedColumn>();
  for (const column of [...columnWindow.start, ...columnWindow.center, ...columnWindow.end]) {
    mounted.set(column.columnId, column);
  }
  const displayed = new Set(columnWindow.layout.columns.map((column) => column.columnId));
  const targets: ColumnFitTarget[] = [];
  const skipped: ColumnFitSkip[] = [];
  const unmountedReason = (columnId: string): ColumnFitSkip["reason"] => {
    if (isKnown(columnId)) return displayed.has(columnId) ? "not-mounted" : "hidden";
    return "unknown";
  };
  for (const columnId of new Set(columnIds ?? mounted.keys())) {
    const column = mounted.get(columnId);
    if (column === undefined) {
      skipped.push({ columnId, reason: unmountedReason(columnId) });
      continue;
    }
    const limits = columnFitLimits(column, maxColumnWidth);
    targets.push({ columnId, layoutIndex: column.layoutIndex, limits });
  }
  return { targets, skipped };
};
