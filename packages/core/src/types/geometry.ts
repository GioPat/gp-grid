// packages/core/src/types/geometry.ts
// Geometry contracts shared by the pure resolvers, the `GridGeometry`
// service and the framework adapters. Nothing here exposes DOM types.

import type { ColumnDefinition } from "./columns";
import type { RowRegion } from "../geometry/row-regions-mapping";
import type { FrozenRowsState, RowRegionLayout } from "../geometry/row-regions";

/**
 * Row region a virtualized row renders in. `"frozen"` is the always-visible
 * prefix, `"suffix"` the scrolling remainder (C5).
 */
export type { RowRegion };
export type { FrozenRowsState, RowRegionLayout };

/** Resolved display width policy for the grid's columns. */
export type ColumnLayoutMode = "fit" | "fixed";

export interface AxisBounds {
  readonly start: number;
  readonly end: number;
}

/** Requested pin: abut the inline start or the inline end of the viewport. */
export type ColumnPin = "start" | "end";

/** Effective region a displayed column renders in. */
export type ColumnRegion = "start" | "center" | "end";

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
  readonly columnId: string;
  /**
   * Index into `GridCore.getColumns()`; the index space of `CellPosition.col`.
   * Differs from the display index — the column's position in the snapshot's
   * `columns` — once a column is hidden, because a hidden column keeps its slot.
   */
  readonly layoutIndex: number;
  readonly column: ColumnDefinition;
  /** Left edge in content coordinates. */
  readonly offset: number;
  /** Displayed width in CSS px. */
  readonly width: number;
}

/** A displayed column with its effective region and region-local offset. */
export interface ResolvedColumn extends DisplayedColumn {
  readonly region: ColumnRegion;
  /**
   * Inline offset inside the column's region container. Equals `offset` for
   * start and center columns; for an end pin it is relative to the end
   * region's own start (see `ColumnRegionLayout.endOffset`).
   */
  readonly regionOffset: number;
}

/**
 * Admitted pin regions: displayed-index splits plus the widths they occupy.
 * `[0, centerStart)` are start pins, `[centerStart, centerEnd)` center columns
 * and `[centerEnd, count)` end pins.
 */
export interface ColumnRegionLayout {
  readonly centerStart: number;
  readonly centerEnd: number;
  readonly startWidth: number;
  readonly endWidth: number;
  /** Viewport x of the end region's start edge. */
  readonly endOffset: number;
  /** Body width left for scrolling center columns; never negative. */
  readonly centerViewportWidth: number;
}

/** Immutable snapshot of the displayed column layout. */
export interface ColumnLayoutSnapshot {
  readonly revision: number;
  readonly mode: ColumnLayoutMode;
  /** Displayed columns in display order, with effective regions and offsets. */
  readonly columns: readonly ResolvedColumn[];
  readonly totalWidth: number;
  readonly regions: ColumnRegionLayout;
}

/** A resolved layout plus the layouts its region mapping is derived from. */
export interface ColumnGeometryInput {
  readonly columns: readonly ResolvedColumn[];
  readonly totalWidth: number;
  readonly regions: ColumnRegionLayout;
}

/**
 * Region-aware column mapping over one layout: effective columns, viewport x
 * lookup and the region clip. Rebuilt when the layout or the viewport width
 * changes, never per scroll sample.
 */
export interface ResolvedColumnGeometry {
  readonly columns: readonly ResolvedColumn[];
  readonly regions: ColumnRegionLayout;
  /** Displayed column by resolved-layout index. */
  readonly byLayoutIndex: ReadonlyMap<number, ResolvedColumn>;
  /** Viewport x of a column's inline edge, or `undefined` outside the layout. */
  viewportLeft(layoutIndex: number, scrollLeft: number): number | undefined;
  /** Displayed index at a viewport x; `-1` with no columns, `count` past the end. */
  displayedAt(x: number, scrollLeft: number): number;
  /** Viewport x-range of the region a column renders in. */
  clip(layoutIndex: number): AxisBounds | undefined;
}

/** A half-open displayed-index range over the center columns. */
export interface ColumnWindowSnapshot {
  readonly layout: ColumnLayoutSnapshot;
  readonly range: AxisBounds;
  /** Displayed columns mounted as start pins. */
  readonly start: readonly ResolvedColumn[];
  /** Center columns to mount: the range plus any retained column. */
  readonly center: readonly ResolvedColumn[];
  /** Displayed columns mounted as end pins. */
  readonly end: readonly ResolvedColumn[];
}

export interface CellBounds {
  readonly coordinateSpace: GeometrySpace;
  readonly rowIndex: number;
  readonly layoutIndex: number;
  readonly columnId: string;
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
  readonly columnId?: string;
  /** Region the hit column renders in, or `null` outside every column. */
  readonly region: ColumnRegion | null;
  /** Region the hit row renders in; `null` outside the row axis (C5). */
  readonly rowRegion: RowRegion | null;
}

/** DOM scroll offsets that bring a target into view; an axis is omitted when
 * it needs no movement. */
export interface ScrollTarget {
  readonly scrollTop?: number;
  readonly scrollLeft?: number;
}

/**
 * C11 auto-scroll inputs for a body rectangle: the frozen band edge and the
 * suffix clip it scrolls in, plus the vertical step limits in DOM scroll
 * space. With no published regions `frozenExtent` is 0 and the clip is the
 * whole body, which is the flat rectangle.
 */
export interface RowScrollEdges {
  readonly region: {
    /** Body-relative y where the frozen band ends; the suffix clip starts. */
    readonly frozenExtent: number;
    /** Body height left below the band; zero disables vertical movement. */
    readonly suffixViewportHeight: number;
  };
  readonly limits: {
    /** Clamped current scroll top: the up step stops here. */
    readonly scrollTop: number;
    /** Largest reachable scroll top: the down step stops here. */
    readonly maxScrollTop: number;
  };
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
  /** C3 frozen/suffix layout; never `null`, reused while unchanged. */
  getRowRegions(): RowRegionLayout;
  getRowBounds(viewIndex: number, space?: GeometrySpace): AxisBounds | undefined;
  getColumnBounds(layoutIndex: number, space?: GeometrySpace): AxisBounds | undefined;
  /**
   * Viewport y-range of the region a row renders in: the frozen band for a
   * frozen row, `[frozenExtent, viewportHeight)` for a suffix row (C5).
   */
  getRowClip(viewIndex: number): AxisBounds | undefined;
  /** Reachable logical (content) scroll range of the row axis. */
  getRowScrollRange(): AxisBounds;
  hasVerticalScrollRange(): boolean;
  /**
   * C11 auto-scroll rectangle and step limits for a drag inside the body
   * rectangle `containerHeight` px tall, starting at `scrollTop`.
   */
  getRowScrollEdges(scrollTop: number, containerHeight: number): RowScrollEdges;
  /** Displayed column at a layout index, including its effective region. */
  getColumn(layoutIndex: number): ResolvedColumn | undefined;
  /**
   * Viewport x-range of the region a column renders in: start and end pins
   * report their admitted region, a center column the center clip. Clips are
   * viewport px and pins are viewport-anchored, so scrolling the center does
   * not move them.
   */
  getColumnClip(layoutIndex: number): AxisBounds | undefined;
  /**
   * Viewport x-range of the center clip itself. The center scrolls inside it,
   * so a center column outside it is covered by an admitted pin.
   */
  getCenterClip(): AxisBounds;
  /** Center columns to mount at the last committed scroll sample. */
  getColumnWindow(): ColumnWindowSnapshot;
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
