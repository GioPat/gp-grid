import type { RowId } from "../types";
import type { RowWindowRange } from "./row-window-loader";

/** Cap on the resident rows inspected for the duplicate-RowId diagnostic. */
const DUPLICATE_ID_SCAN_LIMIT = 10_000;

export interface RowIdDiagnosticsOptions<TData> {
  getCachedRows: () => Map<number, TData>;
  getRowId?: (row: TData) => RowId;
  /** Loaded window whose rows are scanned for new id sightings. */
  getLoadRange: () => RowWindowRange;
}

export class RowIdDiagnostics<TData = unknown> {
  private readonly options: RowIdDiagnosticsOptions<TData>;
  private hasWarned = false;
  /** Bounded id -> view index sightings from visited windows. */
  private readonly seenRowIds = new Map<RowId, number>();

  constructor(options: RowIdDiagnosticsOptions<TData>) {
    this.options = options;
  }

  /**
   * Once-only diagnostic for duplicate IDs among the rows currently resident
   * in the cache. Bounded by the resident set and by a scan cap, so a huge
   * client dataset never turns binding into a full-dataset validation.
   */
  diagnoseLoadedRows(): void {
    if (this.hasWarned) return;
    const getRowId = this.options.getRowId;
    if (getRowId === undefined) return;
    const seen = new Set<RowId>();
    let scanned = 0;
    for (const row of this.options.getCachedRows().values()) {
      if (scanned >= DUPLICATE_ID_SCAN_LIMIT) return;
      scanned += 1;
      const rowId = getRowId(row);
      if (seen.has(rowId)) {
        this.hasWarned = true;
        console.warn(`[gp-grid] Duplicate row id ${JSON.stringify(rowId)}`);
        return;
      }
      seen.add(rowId);
    }
  }

  /**
   * Duplicate check for rows entering the window, beyond the load-time scan
   * cap. A sighting only counts while its earlier row still holds that id.
   */
  diagnoseWindowRows(): void {
    const getRowId = this.options.getRowId;
    if (this.hasWarned || getRowId === undefined) return;
    const { startRow, endRow } = this.options.getLoadRange();
    const cachedRows = this.options.getCachedRows();
    for (let viewIndex = startRow; viewIndex < endRow; viewIndex++) {
      const row = cachedRows.get(viewIndex);
      if (row === undefined) continue;
      const rowId = getRowId(row);
      if (this.isHeldByAnotherRow(rowId, viewIndex, getRowId)) {
        this.hasWarned = true;
        console.warn(`[gp-grid] Duplicate row id ${JSON.stringify(rowId)}`);
        return;
      }
      if (this.seenRowIds.size >= DUPLICATE_ID_SCAN_LIMIT) {
        this.seenRowIds.clear();
      }
      this.seenRowIds.set(rowId, viewIndex);
    }
  }

  private isHeldByAnotherRow(
    rowId: RowId,
    viewIndex: number,
    getRowId: (row: TData) => RowId,
  ): boolean {
    const seenAt = this.seenRowIds.get(rowId);
    if (seenAt === undefined || seenAt === viewIndex) return false;
    const other = this.options.getCachedRows().get(seenAt);
    return other !== undefined && getRowId(other) === rowId;
  }
}
