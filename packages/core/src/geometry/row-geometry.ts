// packages/core/src/geometry/row-geometry.ts
// Row-axis memo, the C3 region layout and the C4–C6 region-aware row queries.
// Every input is numeric and injected, so this module and its tests stay
// independent of managers, GridCore and the DOM.

import type { AxisBounds } from "../types/geometry";
import type { VirtualAxis } from "./virtual-axis";
import { createFixedAxis } from "./fixed-axis";
import { createRowMapper, type RowMapper, type RowScrollMapping } from "./row-mapping";
import type { FrozenRowsInput, RowRegionLayout } from "./row-regions";
import { resolveRowRegionLayout } from "./row-regions";
import type { RowRegion, RowRegionMappingInput } from "./row-regions-mapping";
import {
  getRowRegionPosition,
  getSuffixRowViewportTop,
  getSuffixWindow,
  getSuffixWrapperOffset,
} from "./row-regions-mapping";

export type { RowMapper, RowScrollMapping } from "./row-mapping";

export interface RowGeometryDeps {
  /** Row count and height; `count` is the displayed view-row count. */
  getRowCount(): number;
  getRowHeight(): number;
  /** Body content-area height: excludes the header. */
  getViewportHeight(): number;
  /** Body height left below the frozen block; full height with no regions. */
  getSuffixViewportHeight(): number;
  getOverscan(): number;
  mapping: RowScrollMapping;
  /** C2 input; absent or `null` resolves the zero-count layout. */
  resolveRegions?: () => FrozenRowsInput | null;
}

export interface RowGeometry {
  /** Current row axis; call `syncAxis` after a row-count change. */
  getAxis(): VirtualAxis;
  syncAxis(): VirtualAxis;
  /** Overscanned suffix window, half-open. */
  getWindow(): AxisBounds;
  /** Suffix window without overscan, half-open. */
  getVisibleWindow(): AxisBounds;
  /**
   * Finite viewport-plus-overscan row estimate for bootstrap paging, while
   * the count is unknown. Never an axis: windows and bounds stay empty.
   */
  getBootstrapRowCount(): number;
  /** 0 for an empty axis; otherwise the index at the logical top. */
  getFirstVisibleIndex(): number;
  /** Row top in `content` coordinates. */
  getRowOffset(viewIndex: number): number;
  /**
   * Viewport-space row top for the effective scroll sample: a frozen row
   * keeps its content offset, a suffix row its `offset − logicalTop` (C4).
   */
  getRowViewportTop(viewIndex: number, region: RowRegion): number;
  getRowEdgeOffset(
    boundaryIndex: number,
    space: "content" | "viewport" | "rows",
  ): number | undefined;
  getMapper(): RowMapper;
  /** C3 layout resolved against the current axis and viewport. */
  getRegionLayout(): RowRegionLayout;
  /** Re-resolve the region layout; reuses the object while nothing changed. */
  syncRegionLayout(): RowRegionLayout;
  /** Rows-space position; a frozen row keeps its content offset (C4). */
  getRowRegionPosition(rowIndex: number): number;
  /** Y offset of the rows wrapper, anchored on the first visible suffix row. */
  getRowsWrapperOffset(): number;
  /** Reachable logical scroll range, from the mapper. */
  getRowScrollRange(): AxisBounds;
  hasVerticalScrollRange(): boolean;
  /** C5/C6 frame at the live viewport height, for hits, clips and targets. */
  getRegionInput(scrollTop?: number): RowRegionMappingInput;
}

export const createRowGeometry = (deps: RowGeometryDeps): RowGeometry => {
  let count = -1;
  let height = -1;
  let axis: VirtualAxis = createFixedAxis(0, deps.getRowHeight());
  let regionLayout: RowRegionLayout | null = null;

  const syncAxis = (): VirtualAxis => {
    const nextCount = Math.max(0, Math.trunc(deps.getRowCount()));
    const nextHeight = deps.getRowHeight();
    if (nextCount === count && nextHeight === height) return axis;
    count = nextCount;
    height = nextHeight;
    axis = createFixedAxis(count, nextHeight);
    return axis;
  };

  const mapper = createRowMapper(deps);
  const logicalTop = (): number => mapper.getLogicalScrollTop();

  /** No request keeps the flat path: zero count, the live body height. */
  const zeroRegionInput = (): FrozenRowsInput => ({
    axis: syncAxis(),
    requestedCount: 0,
    viewportHeight: deps.getViewportHeight(),
    viewportMeasured: true,
  });

  const regionInput = (): FrozenRowsInput => {
    const requested = deps.resolveRegions?.() ?? null;
    if (requested === null) return zeroRegionInput();
    // The live axis always wins: the request never owns row geometry.
    return { ...requested, axis: syncAxis() };
  };

  const syncRegionLayout = (): RowRegionLayout => {
    const next = resolveRowRegionLayout(regionInput(), regionLayout ?? undefined);
    regionLayout = next;
    return next;
  };

  const getRegionLayout = (): RowRegionLayout => regionLayout ?? syncRegionLayout();

  const frameOf = (
    layout: RowRegionLayout,
    viewportHeight: number,
    scrollTop: number,
    overscan: number = deps.getOverscan(),
  ): RowRegionMappingInput => ({
    axis: syncAxis(),
    mapper,
    frozenCount: layout.frozenCount,
    frozenExtent: layout.frozenExtent,
    viewportHeight,
    scrollTop,
    overscan,
  });

  const getRegionInput = (scrollTop?: number): RowRegionMappingInput =>
    frameOf(
      getRegionLayout(),
      deps.getViewportHeight(),
      scrollTop ?? deps.mapping.getDomScrollTop(),
    );

  /** The suffix height plus the block is the frame's body height (C3). */
  const windowFrame = (overscan: number = deps.getOverscan()): RowRegionMappingInput => {
    const layout = getRegionLayout();
    return frameOf(
      layout,
      layout.frozenExtent + deps.getSuffixViewportHeight(),
      deps.mapping.getDomScrollTop(),
      overscan,
    );
  };

  return {
    getAxis: () => axis,
    syncAxis,
    getWindow: () => getSuffixWindow(windowFrame()),
    getVisibleWindow: () => getSuffixWindow(windowFrame(0)),
    getBootstrapRowCount: () => {
      const viewportHeight = deps.getViewportHeight();
      if (Number.isFinite(viewportHeight) === false || viewportHeight <= 0) return 0;
      return Math.ceil(viewportHeight / deps.getRowHeight()) + deps.getOverscan();
    },
    getFirstVisibleIndex: () => {
      if (axis.count === 0) return 0;
      return Math.max(axis.indexAt(logicalTop()), 0);
    },
    getRowOffset: (viewIndex) => axis.getOffset(viewIndex),
    getRowViewportTop: (viewIndex, region) => {
      if (region === "frozen") return axis.getOffset(viewIndex);
      return getSuffixRowViewportTop(getRegionInput(), viewIndex);
    },
    getRowEdgeOffset: (boundaryIndex, space) => {
      const valid =
        Number.isSafeInteger(boundaryIndex) && boundaryIndex >= 0 && boundaryIndex <= axis.count;
      if (valid === false) return undefined;
      if (space === "rows") return getRowRegionPosition(getRegionInput(), boundaryIndex);
      const offset = axis.getOffset(boundaryIndex);
      if (space === "content") return offset;
      // Frozen edges do not scroll; the prefix boundary is the block's bottom.
      if (boundaryIndex <= getRegionLayout().frozenCount) return offset;
      return offset - logicalTop();
    },
    getMapper: () => mapper,
    getRegionLayout,
    syncRegionLayout,
    getRowRegionPosition: (rowIndex) => getRowRegionPosition(getRegionInput(), rowIndex),
    getRowsWrapperOffset: () => getSuffixWrapperOffset(getRegionInput()),
    getRowScrollRange: () => ({ start: 0, end: mapper.getMaxLogicalScrollTop() }),
    hasVerticalScrollRange: () => mapper.getMaxLogicalScrollTop() > 0,
    getRegionInput,
  };
};
