// packages/core/src/geometry/column-widths.ts
// Pure width normalization and display-width resolution. Diagnostics and
// event emission belong to the model/core boundary, never here.

import type { ColumnLayoutMode } from "../types/geometry";

/** Fallback used when a declared or overridden width is not usable. */
export const DEFAULT_MIN_COLUMN_WIDTH = 50;

export interface WidthSource {
  readonly columnId: string;
  readonly hidden?: boolean;
  readonly width: number;
  readonly overridden: boolean;
}

/** A usable width must be positive and finite. */
export const normalizeColumnWidth = (width: number): number =>
  Number.isFinite(width) && width > 0 ? width : DEFAULT_MIN_COLUMN_WIDTH;

export const isUsableWidth = (width: number): boolean =>
  Number.isFinite(width) && width > 0;

/**
 * Resolve displayed widths for the visible columns.
 *
 * `fit` expands columns without an explicit override so their total reaches
 * the viewport; overridden columns keep their exact pixel width and the slack
 * is shared by the rest. When every column is overridden the slack stays
 * empty. `fixed` always uses the base widths.
 */
export const resolveColumnWidths = (
  sources: readonly WidthSource[],
  mode: ColumnLayoutMode,
  viewportWidth: number,
): number[] => {
  const base = sources.map((source) => normalizeColumnWidth(source.width));
  if (mode === "fixed" || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return base;
  }

  let baseTotal = 0;
  let overrideTotal = 0;
  let flexibleTotal = 0;
  let overrideCount = 0;
  let flexibleCount = 0;
  for (let i = 0; i < sources.length; i++) {
    const width = base[i]!;
    baseTotal += width;
    if (sources[i]!.overridden) {
      overrideTotal += width;
      overrideCount += 1;
    } else {
      flexibleTotal += width;
      flexibleCount += 1;
    }
  }

  // `fit` only ever expands: a base total that reaches (or overflows) the
  // viewport keeps its declared/overridden widths. Numerical slack counts as
  // reaching, so float rounding cannot shrink a column.
  const tolerance = Math.max(1e-9, viewportWidth * Number.EPSILON * 4);
  if (baseTotal === 0 || baseTotal >= viewportWidth - tolerance) return base;
  if (flexibleCount === 0) return base;

  const slack = viewportWidth - overrideTotal;
  if (slack <= flexibleTotal - tolerance) return base;

  const scale = slack / flexibleTotal;
  return base.map((width, i) => (sources[i]!.overridden ? width : width * scale));
};
