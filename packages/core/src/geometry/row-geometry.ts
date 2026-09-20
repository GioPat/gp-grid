// packages/core/src/geometry/row-geometry.ts
// Row-axis memo, rows-space offsets and the compressed-scroll mapping the
// rest of core consumes. Every input is numeric and injected, so this module
// and its tests stay independent of managers, GridCore and the DOM.

import type { VirtualAxis } from "./virtual-axis";
import { createFixedAxis } from "./fixed-axis";

export interface RowScrollMapping {
  /** Effective DOM scroll sample: the touch override when one is active. */
  getDomScrollTop(): number;
  /** DOM scrollTop for a logical (content) scrollTop. */
  toDomScrollTop(logical: number): number;
  /** Logical (content) scrollTop for a DOM scrollTop. */
  toLogicalScrollTop(dom: number): number;
  isScalingActive(): boolean;
  /** End of the logical scroll range the DOM scroller can reach. */
  getMaxLogicalScrollTop(): number;
}

export interface RowGeometryDeps {
  /** Row count and height; `count` is the displayed view-row count. */
  getRowCount(): number;
  getRowHeight(): number;
  /** Body content-area height: excludes the header. */
  getViewportHeight(): number;
  getOverscan(): number;
  mapping: RowScrollMapping;
}

export interface RowMapper {
  toLogicalScrollTop(dom: number): number;
  toDomScrollTop(logical: number): number;
  /** Logical scroll top for the effective scroll sample. */
  getLogicalScrollTop(): number;
  hasVerticalCompression(): boolean;
  getMaxLogicalScrollTop(): number;
  /** DOM position for a logical scroll top, clamped to the reachable range. */
  toDomScrollTopClamped(logical: number): number;
  /** translateY inside the rows wrapper (rows space). */
  rowPosition(viewIndex: number): number;
  /** Y offset of the rows wrapper itself (rows space). */
  wrapperOffset(): number;
}

export interface RowGeometry {
  /** Current row axis; call `syncAxis` after a row-count change. */
  getAxis(): VirtualAxis;
  syncAxis(): VirtualAxis;
  /** Overscanned window, half-open. */
  getWindow(): { start: number; end: number };
  /** Window without overscan, half-open. */
  getVisibleWindow(): { start: number; end: number };
  /**
   * Finite viewport-plus-overscan row estimate for bootstrap paging, while
   * the count is unknown. Never an axis: windows and bounds stay empty.
   */
  getBootstrapRowCount(): number;
  /** 0 for an empty axis; otherwise the index at the logical top. */
  getFirstVisibleIndex(): number;
  /** Row top in `content` coordinates. */
  getRowOffset(viewIndex: number): number;
  /** Viewport-space row top for the effective scroll sample. */
  getRowViewportTop(viewIndex: number): number;
  getRowEdgeOffset(
    boundaryIndex: number,
    space: "content" | "viewport" | "rows",
  ): number | undefined;
  getMapper(): RowMapper;
}

/**
 * Rows-wrapper invariant, with logical top `L`, effective DOM top `D` and
 * first-visible-row offset `A`: `rowPosition = rowOffset − A` and
 * `wrapperOffset = D − (L − A)`, so `wrapperOffset + rowPosition − D`
 * always equals `rowOffset − L` — including fractional touch overrides.
 */
const createMapper = (deps: RowGeometryDeps, getAxis: () => VirtualAxis): RowMapper => {
  const { mapping } = deps;

  const getLogicalScrollTop = (): number =>
    mapping.toLogicalScrollTop(mapping.getDomScrollTop());

  /** Content offset of the first visible row; the anchor of rows space. */
  const getAnchorOffset = (): number => {
    const axis = getAxis();
    const index = clampFirstVisible(axis.indexAt(getLogicalScrollTop()), axis.count);
    return axis.getOffset(index);
  };

  const getMaxLogicalScrollTop = (): number => mapping.getMaxLogicalScrollTop();

  const toDomScrollTopClamped = (logical: number): number => {
    const maxLogical = getMaxLogicalScrollTop();
    const bounded = Math.min(Math.max(logical, 0), maxLogical);
    if (mapping.isScalingActive() === false) return bounded;
    if (maxLogical <= 0) return 0;
    return mapping.toDomScrollTop(maxLogical) * (bounded / maxLogical);
  };

  return {
    toLogicalScrollTop: (dom) => mapping.toLogicalScrollTop(dom),
    toDomScrollTop: (logical) => mapping.toDomScrollTop(logical),
    getLogicalScrollTop,
    hasVerticalCompression: () => mapping.isScalingActive(),
    getMaxLogicalScrollTop,
    toDomScrollTopClamped,
    rowPosition: (viewIndex) => {
      const rowOffset = getAxis().getOffset(viewIndex);
      if (mapping.isScalingActive() === false) return rowOffset;
      return rowOffset - getAnchorOffset();
    },
    wrapperOffset: () => {
      if (mapping.isScalingActive() === false) return 0;
      return mapping.getDomScrollTop() - (getLogicalScrollTop() - getAnchorOffset());
    },
  };
};

const clampFirstVisible = (index: number, count: number): number =>
  Math.min(Math.max(index, 0), count);

export const createRowGeometry = (deps: RowGeometryDeps): RowGeometry => {
  let count = -1;
  let height = -1;
  let axis: VirtualAxis = createFixedAxis(0, deps.getRowHeight());

  const syncAxis = (): VirtualAxis => {
    const nextCount = Math.max(0, Math.trunc(deps.getRowCount()));
    const nextHeight = deps.getRowHeight();
    if (nextCount === count && nextHeight === height) return axis;
    count = nextCount;
    height = nextHeight;
    axis = createFixedAxis(count, nextHeight);
    return axis;
  };

  const mapper = createMapper(deps, syncAxis);
  const logicalTop = (): number => mapper.getLogicalScrollTop();

  return {
    getAxis: () => axis,
    syncAxis,
    getWindow: () => axis.getWindow(logicalTop(), deps.getViewportHeight(), deps.getOverscan()),
    getVisibleWindow: () => axis.getWindow(logicalTop(), deps.getViewportHeight()),
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
    getRowViewportTop: (viewIndex) => axis.getOffset(viewIndex) - logicalTop(),
    getRowEdgeOffset: (boundaryIndex, space) => {
      const valid =
        Number.isSafeInteger(boundaryIndex) && boundaryIndex >= 0 && boundaryIndex <= axis.count;
      if (valid === false) return undefined;
      if (space === "rows") return mapper.rowPosition(boundaryIndex);
      const offset = axis.getOffset(boundaryIndex);
      return space === "viewport" ? offset - logicalTop() : offset;
    },
    getMapper: () => mapper,
  };
};
