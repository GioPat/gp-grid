// packages/core/src/types/columnar.ts
// Generic read-only columnar source contracts.

import type { CellValue, RowId } from "./basic";
import type { DataSource } from "./data-source";

/**
 * One borrowed column.
 *
 * Supply either a resident backing store (`data`) or a scalar `getValue`
 * accessor for derived/nullable fields. A field never materializes row
 * objects and is never scanned by the grid.
 */
export interface ColumnarField {
  /**
   * Stable source-field key. Must be unique within the source and is
   * independent of any display label (`ColumnDefinition.headerName`).
   */
  field: string;
  /**
   * Borrowed backing store: an ordinary array or a typed-array view. The
   * source keeps this reference as-is; the underlying `buffer`, `byteOffset`
   * and `length` of a typed-array view are preserved and never re-sliced.
   */
  data?: ArrayLike<CellValue>;
  /**
   * Scalar accessor for a field that is not backed by a resident array.
   * Called with the SOURCE row position (`0..rowCount-1`).
   */
  getValue?: (sourceRow: number) => CellValue;
  /**
   * Declared source length. Defaults to `data.length`. Required for an
   * accessor-only field when no source `rowCount` is supplied. Declared
   * lengths must agree across fields; the grid validates this in O(c).
   */
  length?: number;
}

/** Options accepted by {@link createColumnarDataSource}. */
export interface ColumnarDataSourceOptions {
  /** Columns, in source order. Construction is O(c). */
  fields: ColumnarField[];
  /**
   * Declared source row count. Inferred from the fields' declared lengths
   * when omitted. Never computed by scanning values.
   */
  rowCount?: number;
  /**
   * Optional stable identity accessor. Identity is resolved lazily per
   * source row; the grid never builds an eager ID table on bind.
   */
  getRowId?: (sourceRow: number) => RowId;
  /**
   * Declared source revision. Bump it (via {@link ColumnarDataSource.setRevision})
   * for in-place data updates; array-reference equality is not enough.
   */
  revision?: number;
}

/** Scalar, position-addressed access to one columnar source revision. */
export interface ColumnarAccess {
  /** Source row count for this revision. */
  readonly rowCount: number;
  /** Source revision this access belongs to. */
  readonly revision: number;
  /** Source-field keys, in source order. */
  readonly fields: readonly string[];
  /** Read a raw scalar at a SOURCE row position. */
  getValue(sourceRow: number, field: string): CellValue;
  /** Stable identity for a source row, when one is declared. */
  getRowId?(sourceRow: number): RowId;
}

/**
 * A read-only generic columnar source.
 *
 * Binding performs O(c) work and allocates O(c) metadata, independent of the
 * number of source rows. The source owns no copy of the caller's columns and
 * never mutates, frees or detaches them.
 */
export interface ColumnarDataSource extends DataSource<never> {
  /** Capability discriminant. */
  readonly kind: "columnar";
  /** Read-only marker consumed by the central write-rejection path. */
  readonly writable: false;
  /** Direct source access; usable without a query. */
  readonly access: ColumnarAccess;
  /** Current declared source revision. */
  readonly revision: number;
  /**
   * Explicit, opt-in full-record materialization for one source row.
   * O(c) per call. Core rendering never invokes it implicitly.
   */
  getRecord(sourceRow: number): Record<string, CellValue>;
  /**
   * Replace the declared source revision for an in-place data update.
   *
   * When the source was created with an explicit `rowCount`, pass the updated
   * row count as the second argument; declared lengths are revalidated in O(c).
   * Accessor-only fields do not need to change (their `length` is only a hint
   * used when no `rowCount` is supplied).
   */
  setRevision(revision: number, rowCount?: number): void;
}

/**
 * Whether a value is a columnar source. Uses the capability discriminant so
 * an arbitrary `DataSource` cannot be mistaken for one structurally.
 */
export const isColumnarDataSource = (
  source: unknown,
): source is ColumnarDataSource => {
  if (typeof source !== "object" || source === null) return false;
  const candidate = source as { kind?: unknown; access?: unknown };
  return (
    candidate.kind === "columnar" &&
    typeof candidate.access === "object" &&
    candidate.access !== null
  );
};
