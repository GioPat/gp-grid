// packages/core/src/geometry/grid-row-queries.ts
// The row half of the geometry service: the row axis/mapping, region admission,
// bounds, hit-testing and the vertical scroll target. GridGeometry composes it
// with the column view and owns only the revision and the refresh order.

import type { AxisBounds, CellBounds, GeometrySpace, ViewportPoint } from "../types/geometry";
import type { PlacedRowSize } from "./override-axis";
import type { RowGeometry, RowGeometryDeps, RowScrollMapping } from "./row-geometry";
import { createRowGeometry } from "./row-geometry";
import type { FrozenRowsInput, RowRegionLayout } from "./row-regions";
import type { RowRegion, RowRegionHit, RowRegionMappingInput } from "./row-regions-mapping";
import { getRowClip, hitTestRowRegion, resolveRowRegionScrollTop } from "./row-regions-mapping";
import type { VirtualAxis } from "./virtual-axis";
import {
  clampScroll,
  createMaxScrollTop,
  normalizeSample,
  type GridViewportSample,
} from "./viewport-sample";

export interface GridRowViewDeps {
  getRowCount(): number;
  getRowHeight(): number;
  getOverscan(): number;
  getViewport(): GridViewportSample;
  getScrollMapping(): RowScrollMapping;
  /**
   * Frozen-row request; absent or `null` resolves the zero-count layout. The
   * row view resolves it with its own axis and viewport sample.
   */
  getFrozenRowsRequest?: () => FrozenRowsRequest | null;
  /** Application-set row sizes; absent while none is placed (D2/D3). */
  getPlacedRowSizes?: () => readonly PlacedRowSize[];
  /** Displayed column at a layout index in `space`; `undefined` when hidden. */
  getDisplayedColumn(layoutIndex: number, space: GeometrySpace): CellBoundsColumn | undefined;
  createRowGeometry?: (deps: RowGeometryDeps) => RowGeometry;
}

/** Column placement a cell bound reports; the row view owns the vertical half. */
export interface CellBoundsColumn {
  columnId: string;
  left: number;
  width: number;
}

export interface FrozenRowsRequest {
  requestedCount: number;
  maxCount?: number;
  minSuffixHeight?: number;
  admitsPrefix?: (count: number) => boolean;
}

export interface GridRowView {
  /** Current row axis; call `syncAxis` after a row-count change. */
  syncAxis(): VirtualAxis;
  getAxis(): VirtualAxis;
  getRowGeometry(): RowGeometry;
  /** Normalized viewport sample every query reads. */
  getViewportSample(): GridViewportSample;
  /** Resolve the C3 region layout against the current axis and viewport. */
  syncRowRegions(): RowRegionLayout;
  getRegionLayout(): RowRegionLayout;
  /** Region a row renders in; frozen rows keep their content offset (C5). */
  rowRegionOf(viewIndex: number): RowRegion;
  getRowTop(viewIndex: number, space: GeometrySpace): number;
  /** Row height as the axis publishes it. */
  getRowHeightOf(viewIndex: number): number;
  getRowBounds(viewIndex: number, space: GeometrySpace): AxisBounds | undefined;
  getCellBounds(
    viewIndex: number,
    layoutIndex: number,
    space: GeometrySpace,
  ): CellBounds | undefined;
  getRowClip(viewIndex: number): AxisBounds | undefined;
  /** C5 frame at the live viewport height: hits, clips and targets read it. */
  getRegionInput(scrollTop?: number): RowRegionMappingInput;
  hitTestRow(point: ViewportPoint): RowRegionHit;
  /** Vertical half of a scroll target; `undefined` when the row already fits. */
  getScrollTop(viewIndex: number, scrollTop: number): number | undefined;
  getRowScrollRange(): AxisBounds;
  hasVerticalScrollRange(): boolean;
  getRowScrollEdges(scrollTop: number, containerHeight: number): {
    region: { frozenExtent: number; suffixViewportHeight: number };
    limits: { scrollTop: number; maxScrollTop: number };
  };
  /** Effective DOM scroll sample, clamped to the reachable range. */
  getEffectiveScrollTop(): number;
}

/** Normalized raw sample; scroll offsets are clamped separately, per axis. */
const viewportOf = (deps: GridRowViewDeps): GridViewportSample =>
  normalizeSample(deps.getViewport());

const isRowIndex = (viewIndex: number, count: number): boolean =>
  Number.isSafeInteger(viewIndex) && viewIndex >= 0 && viewIndex < count;

export const createGridRowView = (deps: GridRowViewDeps): GridRowView => {
  // A DOM sample outside the reachable range (content shrank, a correction is
  // still in flight) is clamped on read, so windows and bounds stay coherent.
  const maxScrollTop = createMaxScrollTop(
    () => rowGeometry.syncAxis(),
    () => deps.getScrollMapping(),
  );
  const clampTop = (scrollTop: number): number =>
    clampScroll(scrollTop, maxScrollTop(viewportOf(deps).height));

  const buildRowGeometry = deps.createRowGeometry ?? createRowGeometry;
  // The region callbacks read `rowGeometry` lazily: nothing resolves a region
  // layout before the view exists, and the zero request short-circuits.
  const rowGeometry: RowGeometry = buildRowGeometry({
    getRowCount: () => deps.getRowCount(),
    getRowHeight: () => deps.getRowHeight(),
    getViewportHeight: () => viewportOf(deps).height,
    getSuffixViewportHeight: () => rowGeometry.getRegionLayout().suffixViewportHeight,
    getOverscan: () => deps.getOverscan(),
    getPlacedRowSizes: deps.getPlacedRowSizes,
    resolveRegions: (): FrozenRowsInput | null => {
      const request = deps.getFrozenRowsRequest?.() ?? null;
      if (request === null) return null;
      const sample = viewportOf(deps);
      return {
        ...request,
        axis: rowGeometry.getAxis(),
        viewportHeight: sample.height,
        viewportMeasured: sample.measured ?? true,
      };
    },
    mapping: {
      getDomScrollTop: () => clampTop(viewportOf(deps).scrollTop),
      toDomScrollTop: (logical) => deps.getScrollMapping().toDomScrollTop(logical),
      toLogicalScrollTop: (dom) => deps.getScrollMapping().toLogicalScrollTop(dom),
      isScalingActive: () => deps.getScrollMapping().isScalingActive(),
      getMaxLogicalScrollTop: () => deps.getScrollMapping().getMaxLogicalScrollTop(),
    },
  });

  const rowRegionOf = (viewIndex: number): RowRegion =>
    viewIndex < rowGeometry.getRegionLayout().frozenCount ? "frozen" : "suffix";

  const rowTop = (viewIndex: number, space: GeometrySpace): number => {
    if (space === "rows") return rowGeometry.getRowRegionPosition(viewIndex);
    if (space === "viewport") return rowGeometry.getRowViewportTop(viewIndex, rowRegionOf(viewIndex));
    return rowGeometry.getRowOffset(viewIndex);
  };

  /** Row height as the axis publishes it; 0 outside the axis. */
  const getRowHeightOf = (viewIndex: number): number =>
    rowGeometry.getAxis().getSize(viewIndex);

  return {
    syncAxis: () => rowGeometry.syncAxis(),
    getAxis: () => rowGeometry.getAxis(),
    getRowGeometry: () => rowGeometry,
    getViewportSample: () => viewportOf(deps),
    syncRowRegions: () => rowGeometry.syncRegionLayout(),
    getRegionLayout: () => rowGeometry.getRegionLayout(),
    rowRegionOf,
    getRowTop: rowTop,
    getRowHeightOf,
    getRowBounds: (viewIndex, space) => {
      rowGeometry.syncAxis();
      if (isRowIndex(viewIndex, rowGeometry.getAxis().count) === false) return undefined;
      const start = rowTop(viewIndex, space);
      return { start, end: start + getRowHeightOf(viewIndex) };
    },
    getCellBounds: (viewIndex, layoutIndex, space) => {
      const column = deps.getDisplayedColumn(layoutIndex, space);
      if (column === undefined) return undefined;
      rowGeometry.syncAxis();
      if (isRowIndex(viewIndex, rowGeometry.getAxis().count) === false) return undefined;
      return {
        coordinateSpace: space,
        rowIndex: viewIndex,
        layoutIndex,
        columnId: column.columnId,
        top: rowTop(viewIndex, space),
        left: column.left,
        width: column.width,
        height: getRowHeightOf(viewIndex),
      };
    },
    getRowClip: (viewIndex) => getRowClip(rowGeometry.getRegionInput(), viewIndex),
    getRegionInput: (scrollTop) => rowGeometry.getRegionInput(scrollTop),
    hitTestRow: (point) => {
      const domScrollTop = Number.isFinite(point.scrollTop)
        ? clampTop(point.scrollTop!)
        : clampTop(viewportOf(deps).scrollTop);
      // C5: the frozen band is resolved before scroll is applied, and a point
      // outside the body keeps the axis sentinel without a region.
      return hitTestRowRegion(rowGeometry.getRegionInput(domScrollTop), point.y);
    },
    getScrollTop: (viewIndex, scrollTop) => {
      rowGeometry.syncAxis();
      // The caller's DOM sample is fresher than the core's when an adapter is
      // about to apply one, so the frame is measured from it.
      return resolveRowRegionScrollTop(rowGeometry.getRegionInput(scrollTop), viewIndex);
    },
    getRowScrollRange: () => rowGeometry.getRowScrollRange(),
    hasVerticalScrollRange: () => rowGeometry.hasVerticalScrollRange(),
    getRowScrollEdges: (scrollTop, containerHeight) => {
      const bodyHeight = Number.isFinite(containerHeight) && containerHeight > 0
        ? containerHeight
        : 0;
      const frozenExtent = rowGeometry.getRegionLayout().frozenExtent;
      const maxTop = maxScrollTop(bodyHeight);
      return {
        region: { frozenExtent, suffixViewportHeight: Math.max(0, bodyHeight - frozenExtent) },
        limits: { scrollTop: clampScroll(scrollTop, maxTop), maxScrollTop: maxTop },
      };
    },
    getEffectiveScrollTop: () => clampTop(viewportOf(deps).scrollTop),
  };
};
