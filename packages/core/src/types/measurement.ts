// packages/core/src/types/measurement.ts
// One-shot content measurement (PRD 007): the host contract a fit reads
// through, and the results the fit commands return.

import type { RowId } from "./basic";

/** One host read for a row fit, taken under one layout revision. */
export interface RowMeasurement {
  /** The root's `data-layout-revision` when the cells were read. */
  readonly layoutRevision: number;
  /** Tallest mounted cell per requested row index; unmeasured rows are absent. */
  readonly heights: ReadonlyMap<number, number>;
  /** Distinct columns whose cells were read. */
  readonly consideredColumns: number;
}

/** One host read for a column fit, taken under one layout revision. */
export interface ColumnMeasurement {
  /** The root's `data-layout-revision` when the cells were read. */
  readonly layoutRevision: number;
  /** Widest of the header and the mounted body cells per requested layout index. */
  readonly widths: ReadonlyMap<number, number>;
  /** Distinct rows whose cells were read. */
  readonly consideredRows: number;
}

/**
 * Synchronous reads of rendered content. Both return `null` when there is
 * nothing to measure against: no root, or a root with a zero client size.
 */
export interface MeasurementHost {
  measureRows(rowIndexes: readonly number[]): RowMeasurement | null;
  measureColumns(layoutIndexes: readonly number[]): ColumnMeasurement | null;
}

/**
 * `"unsupported"`: no host, or the host answered `null`. `"stale"`: the host
 * read under a layout revision that is not the core's; nothing was applied.
 */
export type FitStatus = "applied" | "unchanged" | "unsupported" | "stale";

/** Which bound a fitted size was clamped to, if any. */
export type FitClamp = "min" | "max" | null;

export interface RowFitEntry {
  readonly rowId: RowId;
  readonly height: number;
  readonly clamped: FitClamp;
}

export interface RowFitSkip {
  readonly rowId: RowId;
  readonly reason: "not-mounted";
}

/** Result of `rowHeights.fit`. */
export interface RowFitResult {
  readonly status: FitStatus;
  readonly consideredColumns: number;
  readonly rows: readonly RowFitEntry[];
  readonly skipped: readonly RowFitSkip[];
}

export interface ColumnFitEntry {
  readonly columnId: string;
  readonly width: number;
  readonly clamped: FitClamp;
}

export interface ColumnFitSkip {
  readonly columnId: string;
  readonly reason: "unknown" | "hidden" | "not-mounted";
}

/** Result of `columns.fit`; a fit reads rendered cells only. */
export interface ColumnFitResult {
  readonly status: FitStatus;
  readonly scope: "rendered";
  readonly consideredRows: number;
  readonly columns: readonly ColumnFitEntry[];
  readonly skipped: readonly ColumnFitSkip[];
}
