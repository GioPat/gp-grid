import type { ColumnDefinition } from "../types/columns";
import type { DataSource } from "../types/data-source";
import { createDataSourceFromArray } from "../data-source/client-data-source";

const LARGE_ARRAY_WARN_THRESHOLD = 10_000;

/**
 * Manages the "owned vs. provided" DataSource lifecycle shared by every
 * framework wrapper: wrap a raw `rows` array when the user didn't provide
 * their own DataSource, detect changes to `rows` / `columns` between
 * renders so we don't re-apply unchanged inputs, and destroy the owned
 * DataSource on teardown.
 *
 * The owner is framework-agnostic: it doesn't subscribe to anything.
 * Wrappers drive it from their own reactivity system (signal effects,
 * useEffect, watch) and react to its return values.
 */
export class DataSourceOwner<TData = unknown> {
  private owned: DataSource<TData> | null = null;
  private lastProvided: DataSource<TData> | null = null;
  private lastAppliedRows: TData[] | null = null;
  private lastAppliedColumns: ColumnDefinition[] | null = null;

  /**
   * Call once on setup. If the user provided a DataSource, use it.
   * Otherwise build one from the initial rows array and remember it
   * for later destruction.
   */
  initialize(provided: DataSource<TData> | null, initialRows: TData[]): DataSource<TData> {
    this.lastProvided = provided;
    if (provided !== null) return provided;
    this.owned = createDataSourceFromArray(initialRows);
    this.lastAppliedRows = initialRows;
    return this.owned;
  }

  /**
   * Call when the `rows` input changes. Returns the DataSource the core should
   * bind when it changes, or null when nothing changed. A changed provided
   * source is returned so a wrapper can swap to it at runtime.
   */
  syncRows(rows: TData[], provided: DataSource<TData> | null): DataSource<TData> | null {
    if (provided !== null) {
      if (this.lastProvided === provided) return null;
      // A different provided source replaces any owned one.
      this.owned?.destroy?.();
      this.owned = null;
      this.lastProvided = provided;
      return provided;
    }

    if (this.lastProvided !== null) {
      // Dropping a provided source rebuilds an owned one from the current rows,
      // even when the rows array reference did not change.
      this.lastProvided = null;
      this.lastAppliedRows = rows;
      this.owned?.destroy?.();
      this.owned = createDataSourceFromArray(rows);
      return this.owned;
    }

    if (this.lastAppliedRows === rows) return null;
    this.lastAppliedRows = rows;
    if (rows.length > LARGE_ARRAY_WARN_THRESHOLD) {
      console.warn(
        `[gp-grid] rows input changed with ${rows.length} rows — this triggers a full rebuild. Use createGridData() for efficient updates.`,
      );
    }
    this.owned?.destroy?.();
    this.owned = createDataSourceFromArray(rows);
    return this.owned;
  }

  /**
   * Call when the `columns` input changes. Returns true if the reference
   * is new and the caller should push to core via setColumns; false if
   * unchanged.
   */
  syncColumns(columns: ColumnDefinition[]): boolean {
    if (this.lastAppliedColumns === columns) return false;
    this.lastAppliedColumns = columns;
    return true;
  }

  /** Destroy the owned DataSource, if any. Safe to call multiple times. */
  destroy(): void {
    this.owned?.destroy?.();
    this.owned = null;
  }
}
