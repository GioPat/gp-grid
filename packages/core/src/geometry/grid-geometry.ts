// packages/core/src/geometry/grid-geometry.ts
// The numeric geometry authority. Composes the row axis/mapping with the
// column layout, region admission and the center window, and answers every
// size/offset/window/hit-test/scroll query in named coordinate spaces. All
// inputs are injected callbacks.

import type { ColumnDefinition } from "../types/columns";
import type {
  AxisBounds,
  CellBounds,
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  ContentSize,
  GeometrySpace,
  GridGeometry,
  ResolvedColumn,
  ResolvedColumnGeometry,
  ScrollTarget,
  ViewportPoint,
} from "../types/geometry";
import type { ColumnLayoutResolver } from "./column-layout";
import { createColumnLayoutResolver } from "./column-layout";
import { createColumnGeometry } from "./column-geometry";
import { createRowGeometry } from "./row-geometry";
import type { RowGeometry, RowGeometryDeps, RowScrollMapping } from "./row-geometry";
import type { FrozenRowsInput, RowRegionLayout } from "./row-regions";
import {
  getRowClip as resolveRowClip,
  hitTestRowRegion,
  resolveRowRegionScrollTop,
  type RowRegion,
} from "./row-regions-mapping";
import { resolveScrollTarget } from "./scroll-target";
import { createColumnWindowResolver } from "./column-window";
import {
  clampScroll,
  createMaxScrollTop,
  normalizeSample,
  type GridViewportSample,
} from "./viewport-sample";

export type { GridViewportSample } from "./viewport-sample";

/** Everything `FrozenRowsInput` needs except the axis and the viewport. */
export interface FrozenRowsRequest {
  requestedCount: number;
  maxCount?: number;
  minSuffixHeight?: number;
  admitsPrefix?: (count: number) => boolean;
}

export interface GridGeometryDeps {
  getRowCount(): number;
  getRowHeight(): number;
  getOverscan(): number;
  getColumnOverscan(): number;
  getColumns(): readonly ColumnDefinition[];
  /** Width-override membership per resolved-layout index. */
  isWidthOverridden(layoutIndex: number): boolean;
  getViewport(): GridViewportSample;
  getScrollMapping(): RowScrollMapping;
  /** C2 request; absent or `null` resolves the zero-count layout. */
  getFrozenRowsRequest?: () => FrozenRowsRequest | null;
  createRowGeometry?: (deps: RowGeometryDeps) => RowGeometry;
}

export interface GridGeometryService extends GridGeometry {
  /**
   * Refresh the committed dependencies (row axis, viewport dimensions,
   * mapping) and the column layout/window before a batch captures its
   * revision.
   */
  refresh(): ColumnLayoutSnapshot;
  /** Commit the current row window and bump the revision if it moved. */
  syncWindows(): void;
  /** Commit the column window and bump the revision when it moved. */
  syncColumnWindow(): boolean;
  setColumnLayoutMode(mode: ColumnLayoutMode): void;
  getColumnLayoutMode(): ColumnLayoutMode;
  getRowGeometry(): RowGeometry;
  /** Resolve the C3 region layout against the current axis and viewport. */
  syncRowRegions(): RowRegionLayout;
  /** Columns kept mounted outside the window, keyed and bounded. */
  retainColumns(key: string, columnIds: readonly string[]): void;
  releaseColumns(key: string): void;
  /** Scroll offsets every query answers from; differs from the DOM sample when it is out of range. */
  getEffectiveScroll(): { scrollTop: number; scrollLeft: number };
}

/** Normalized raw sample; scroll offsets are clamped separately, per axis. */
const viewportOf = (deps: GridGeometryDeps): GridViewportSample =>
  normalizeSample(deps.getViewport());

const isSameWindow = (a: AxisBounds, b: AxisBounds): boolean =>
  a.start === b.start && a.end === b.end;

const isRowIndex = (viewIndex: number, count: number): boolean =>
  Number.isSafeInteger(viewIndex) && viewIndex >= 0 && viewIndex < count;

export const createGridGeometry = (
  deps: GridGeometryDeps,
  initialMode: ColumnLayoutMode,
): GridGeometryService => {
  let revision = 0;
  let lastRowWindow: AxisBounds | null = null;
  let lastVisibleWindow: AxisBounds | null = null;
  let lastWidth = -1;
  let lastHeight = -1;

  const bumpRevision = (): void => {
    revision += 1;
  };

  // A DOM sample outside the reachable range (content shrank, a correction is
  // still in flight) is clamped on read, so windows and bounds stay coherent.
  const maxScrollTop = createMaxScrollTop(
    () => rowGeometry.syncAxis(),
    () => deps.getScrollMapping(),
  );
  const clampTop = (scrollTop: number): number =>
    clampScroll(scrollTop, maxScrollTop(viewportOf(deps).height));
  const scrollTopOf = (): number => clampTop(viewportOf(deps).scrollTop);

  const buildRowGeometry = deps.createRowGeometry ?? createRowGeometry;
  // The region callbacks read `rowGeometry` lazily: nothing resolves a region
  // layout before the service exists, and the zero request short-circuits.
  const rowGeometry: RowGeometry = buildRowGeometry({
    getRowCount: () => deps.getRowCount(),
    getRowHeight: () => deps.getRowHeight(),
    getViewportHeight: () => viewportOf(deps).height,
    getSuffixViewportHeight: () => rowGeometry.getRegionLayout().suffixViewportHeight,
    getOverscan: () => deps.getOverscan(),
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
      getDomScrollTop: scrollTopOf,
      toDomScrollTop: (logical) => deps.getScrollMapping().toDomScrollTop(logical),
      toLogicalScrollTop: (dom) => deps.getScrollMapping().toLogicalScrollTop(dom),
      isScalingActive: () => deps.getScrollMapping().isScalingActive(),
      getMaxLogicalScrollTop: () => deps.getScrollMapping().getMaxLogicalScrollTop(),
    },
  });

  const layoutResolver: ColumnLayoutResolver = createColumnLayoutResolver(initialMode, () => {
    bumpRevision();
    return revision;
  });

  const resolveLayout = (): ColumnLayoutSnapshot =>
    layoutResolver.update({
      columns: deps.getColumns(),
      mode: layoutResolver.getMode(),
      width: viewportOf(deps).width,
      isOverridden: (layoutIndex) => deps.isWidthOverridden(layoutIndex),
    });

  // Region mapping and center prefixes are rebuilt only when the layout or
  // the viewport width changes, never per scroll sample.
  let geometryCache: { layout: ColumnLayoutSnapshot; geometry: ResolvedColumnGeometry } | null = null;
  const resolveColumnGeometry = (): ResolvedColumnGeometry => {
    const layout = resolveLayout();
    if (geometryCache?.layout !== layout) {
      geometryCache = { layout, geometry: createColumnGeometry(layout) };
    }
    return geometryCache.geometry;
  };

  const windowResolver = createColumnWindowResolver({
    getLayout: resolveLayout,
    getScrollLeft: () => viewportOf(deps).scrollLeft,
    getViewportWidth: () => viewportOf(deps).width,
    getOverscan: () => deps.getColumnOverscan(),
  });

  const scrollLeftOf = (): number => windowResolver.getScrollLeft();

  const refreshWindows = (): void => {
    const nextWindow = rowGeometry.getWindow();
    if (lastRowWindow === null || isSameWindow(lastRowWindow, nextWindow) === false) {
      lastRowWindow = nextWindow;
      bumpRevision();
    }
    const nextVisible = rowGeometry.getVisibleWindow();
    if (lastVisibleWindow === null || isSameWindow(lastVisibleWindow, nextVisible) === false) {
      lastVisibleWindow = nextVisible;
      bumpRevision();
    }
  };

  const syncDimensions = (): void => {
    const sample = viewportOf(deps);
    if (sample.width === lastWidth && sample.height === lastHeight) return;
    lastWidth = sample.width;
    lastHeight = sample.height;
    bumpRevision();
  };

  const displayedOf = (layoutIndex: number): ResolvedColumn | undefined =>
    resolveColumnGeometry().byLayoutIndex.get(layoutIndex);

  /** Region a row renders in; frozen rows keep their content offset (C5). */
  const rowRegionOf = (viewIndex: number): RowRegion =>
    viewIndex < rowGeometry.getRegionLayout().frozenCount ? "frozen" : "suffix";

  const rowTop = (viewIndex: number, space: GeometrySpace): number => {
    if (space === "rows") return rowGeometry.getRowRegionPosition(viewIndex);
    if (space === "viewport") return rowGeometry.getRowViewportTop(viewIndex, rowRegionOf(viewIndex));
    return rowGeometry.getRowOffset(viewIndex);
  };

  const columnLeft = (column: ResolvedColumn, space: GeometrySpace): number => {
    if (space === "viewport") {
      return resolveColumnGeometry().viewportLeft(column.layoutIndex, scrollLeftOf()) ?? column.offset;
    }
    return column.offset;
  };

  const getBounds = (
    viewIndex: number,
    layoutIndex: number,
    space: GeometrySpace,
  ): CellBounds | undefined => {
    const column = displayedOf(layoutIndex);
    if (column === undefined) return undefined;
    rowGeometry.syncAxis();
    if (isRowIndex(viewIndex, rowGeometry.getAxis().count) === false) return undefined;
    return {
      coordinateSpace: space,
      rowIndex: viewIndex,
      layoutIndex,
      columnId: column.columnId,
      top: rowTop(viewIndex, space),
      left: columnLeft(column, space),
      width: column.width,
      height: deps.getRowHeight(),
    };
  };

  const getScrollTarget = (
    viewIndex: number,
    layoutIndex: number,
    from?: { scrollTop?: number; scrollLeft?: number },
  ): ScrollTarget => {
    rowGeometry.syncAxis();
    const axis = rowGeometry.getAxis();
    const layout = resolveLayout();
    const column = displayedOf(layoutIndex);
    if (column === undefined || isRowIndex(viewIndex, axis.count) === false) return {};
    const scrollLeft = from?.scrollLeft ?? scrollLeftOf();
    const scrollTop = from?.scrollTop ?? scrollTopOf();
    // Horizontal rules are region-independent; the vertical target resolves
    // against the row's own clip, so a frozen row never moves (C6).
    const horizontal = resolveScrollTarget({
      axis,
      mapper: rowGeometry.getMapper(),
      layout,
      column,
      region: column.region,
      // The target is a displayed column, so the clip lookup cannot miss.
      centerClip: resolveColumnGeometry().clip(layoutIndex)!,
      viewIndex,
      rowHeight: deps.getRowHeight(),
      viewport: viewportOf(deps),
      from: { scrollTop, scrollLeft },
    });
    const target: { scrollTop?: number; scrollLeft?: number } = {};
    const vertical = resolveRowRegionScrollTop(
      {
        ...rowGeometry.getRegionInput(scrollTop),
        rowHeight: deps.getRowHeight(),
      },
      viewIndex,
    );
    if (vertical !== undefined) target.scrollTop = vertical;
    if (horizontal.scrollLeft !== undefined) target.scrollLeft = horizontal.scrollLeft;
    return target;
  };

  const service: GridGeometryService = {
    get revision() {
      return revision;
    },
    refresh: () => {
      rowGeometry.syncAxis();
      syncDimensions();
      service.syncRowRegions();
      refreshWindows();
      return resolveLayout();
    },
    syncWindows: () => {
      rowGeometry.syncAxis();
      refreshWindows();
    },
    syncColumnWindow: () => {
      const moved = windowResolver.commit();
      // A window move is a real geometry change (B6): the same revision
      // invalidation a row-window move triggers.
      if (moved) bumpRevision();
      return moved;
    },
    setColumnLayoutMode: (mode) => {
      if (layoutResolver.getMode() === mode) return;
      layoutResolver.setMode(mode);
      // The mode is a committed layout dependency: resolve against it now so
      // this revision is the one the batch reports.
      resolveLayout();
    },
    getColumnLayoutMode: () => layoutResolver.getMode(),
    getColumnLayout: () => resolveLayout(),
    getColumnWindow: () => windowResolver.get(),
    getRowWindow: () => {
      service.syncWindows();
      return rowGeometry.getWindow();
    },
    getVisibleRowWindow: () => {
      service.syncWindows();
      return rowGeometry.getVisibleWindow();
    },
    getRowGeometry: () => rowGeometry,
    syncRowRegions: () => {
      const previous = rowGeometry.getRegionLayout();
      const next = rowGeometry.syncRegionLayout();
      // A region move is a committed geometry dependency (C9): clips, hits
      // and slots all read it, so it advances the batch revision.
      if (next !== previous) bumpRevision();
      return next;
    },
    getRowRegions: () => rowGeometry.getRegionLayout(),
    getRowClip: (viewIndex) => resolveRowClip(rowGeometry.getRegionInput(), viewIndex),
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
    retainColumns: (key, columnIds) => {
      windowResolver.retain(key, columnIds);
    },
    releaseColumns: (key) => {
      windowResolver.retain(key, []);
    },
    getEffectiveScroll: () => ({ scrollTop: scrollTopOf(), scrollLeft: scrollLeftOf() }),
    getRowBounds: (viewIndex, space = "viewport") => {
      rowGeometry.syncAxis();
      if (isRowIndex(viewIndex, rowGeometry.getAxis().count) === false) return undefined;
      const start = rowTop(viewIndex, space);
      return { start, end: start + deps.getRowHeight() };
    },
    getColumnBounds: (layoutIndex, space = "viewport") => {
      const column = displayedOf(layoutIndex);
      if (column === undefined) return undefined;
      const start = columnLeft(column, space);
      return { start, end: start + column.width };
    },
    getColumn: (layoutIndex) => displayedOf(layoutIndex),
    getColumnClip: (layoutIndex) => resolveColumnGeometry().clip(layoutIndex),
    getCenterClip: () => {
      const layout = resolveLayout();
      return {
        start: layout.regions.startWidth,
        end: layout.regions.startWidth + layout.regions.centerViewportWidth,
      };
    },
    getCellBounds: (viewIndex, layoutIndex, space = "viewport") =>
      getBounds(viewIndex, layoutIndex, space),
    getRowEdgeOffset: (boundaryIndex, space = "viewport") =>
      rowGeometry.getRowEdgeOffset(boundaryIndex, space),
    hitTest: (point: ViewportPoint) => {
      const domScrollTop = Number.isFinite(point.scrollTop) ? clampTop(point.scrollTop!) : scrollTopOf();
      const scrollLeft = Number.isFinite(point.scrollLeft)
        ? windowResolver.clampScrollLeft(point.scrollLeft!)
        : scrollLeftOf();
      rowGeometry.syncAxis();
      const geometry = resolveColumnGeometry();

      // C5: the frozen band is resolved before scroll is applied, and a point
      // outside the body keeps the axis sentinel without a region.
      const rowHit = hitTestRowRegion(rowGeometry.getRegionInput(domScrollTop), point.y);
      const displayIndex = geometry.columns.length === 0
        ? -1
        : geometry.displayedAt(point.x, scrollLeft);
      const column = geometry.columns[displayIndex];
      return {
        row: rowHit.rowIndex,
        displayIndex,
        col: column?.layoutIndex ?? -1,
        columnId: column?.columnId,
        region: column?.region ?? null,
        rowRegion: rowHit.rowRegion,
      };
    },
    getScrollTarget,
    getContentSize: (): ContentSize => {
      rowGeometry.syncAxis();
      return {
        width: resolveLayout().totalWidth,
        height: rowGeometry.getAxis().extent,
        coordinateSpace: "content",
      };
    },
  };
  return service;
};
