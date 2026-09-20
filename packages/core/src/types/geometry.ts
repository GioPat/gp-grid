// packages/core/src/types/geometry.ts
// Geometry contracts shared by the pure resolvers, the `GridGeometry`
// service and the framework adapters. Nothing here exposes DOM types.

import type { ColumnDefinition, ColumnId } from "./columns";

/** Resolved display width policy for the grid's columns. */
export type ColumnLayoutMode = "fit" | "fixed";

/**
 * Coordinate space of a bounds/offset query result.
 *
 * - `content`: logical, uncompressed px from the top-left of the scrollable
 *   content (x from the first displayed column, y from row 0, header excluded).
 * - `viewport`: content minus the logical scroll offsets, relative to the body
 *   client area's top-left corner.
 * - `rows`: local to the rows wrapper, the space of `MOVE_SLOT.translateY`.
 *   Equals `content` unless vertical scrolling is compressed; adapter-only.
 */
export type GeometrySpace = "content" | "viewport" | "rows";

/** One displayed (non-hidden) column in the resolved layout. */
export interface DisplayedColumn {
  readonly columnId: ColumnId;
  /** Index into `GridCore.getColumns()`; the index space of `CellPosition.col`. */
  readonly layoutIndex: number;
  readonly column: ColumnDefinition;
  /** Left edge in content coordinates. */
  readonly offset: number;
  /** Displayed width in CSS px. */
  readonly width: number;
}

/** Immutable snapshot of the displayed column layout. */
export interface ColumnLayoutSnapshot {
  readonly revision: number;
  readonly mode: ColumnLayoutMode;
  readonly columns: readonly DisplayedColumn[];
  readonly totalWidth: number;
}

export interface AxisBounds {
  readonly start: number;
  readonly end: number;
}

export interface CellBounds {
  readonly coordinateSpace: GeometrySpace;
  readonly rowIndex: number;
  readonly layoutIndex: number;
  readonly columnId: ColumnId;
  /**
   * Screen origin of the body client area's top-left for `viewport` bounds.
   * Containers that portal overlays compensate for their own body border.
   */
  readonly rootRect?: { readonly top: number; readonly left: number };
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
  /** DOM scroll sample to use instead of the last reported one. */
  readonly scrollTop?: number;
  readonly scrollLeft?: number;
}

/**
 * Result of a viewport hit-test. `row` and `displayIndex` use raw axis
 * sentinels: `-1` before the axis or when there is no such axis, `count` at
 * or past its end.
 */
export interface GridHit {
  readonly row: number;
  /** Index into the displayed columns (hidden columns excluded). */
  readonly displayIndex: number;
  /** Layout index (the space of `CellPosition.col`), or `-1` outside a column. */
  readonly col: number;
  readonly columnId?: ColumnId;
}

/** DOM scroll offsets that bring a target into view; an axis is omitted when
 * it needs no movement. */
export interface ScrollTarget {
  readonly scrollTop?: number;
  readonly scrollLeft?: number;
}

export interface ContentSize {
  readonly width: number;
  readonly height: number;
  readonly coordinateSpace: "content";
}

/** Read-only geometry surface exposed as `GridCore.geometry`. */
export interface GridGeometry {
  readonly revision: number;
  getColumnLayout(): ColumnLayoutSnapshot;
  getRowWindow(): AxisBounds;
  getVisibleRowWindow(): AxisBounds;
  getRowBounds(viewIndex: number, space?: GeometrySpace): AxisBounds | undefined;
  getColumnBounds(layoutIndex: number, space?: GeometrySpace): AxisBounds | undefined;
  getCellBounds(
    viewIndex: number,
    layoutIndex: number,
    space?: GeometrySpace,
  ): CellBounds | undefined;
  getRowEdgeOffset(boundaryIndex: number, space?: GeometrySpace): number | undefined;
  hitTest(point: ViewportPoint): GridHit;
  getScrollTarget(
    viewIndex: number,
    layoutIndex: number,
    from?: { scrollTop?: number; scrollLeft?: number },
  ): ScrollTarget;
  getContentSize(): ContentSize;
}
