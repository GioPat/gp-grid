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
import { resolveScrollTarget } from "./scroll-target";
import { createColumnWindowResolver } from "./column-window";
import {
  clampScroll,
  createMaxScrollTop,
  normalizeSample,
  type GridViewportSample,
} from "./viewport-sample";

export type { GridViewportSample } from "./viewport-sample";

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
  const rowGeometry = buildRowGeometry({
    getRowCount: () => deps.getRowCount(),
    getRowHeight: () => deps.getRowHeight(),
    getViewportHeight: () => viewportOf(deps).height,
    getOverscan: () => deps.getOverscan(),
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

  const rowTop = (viewIndex: number, space: GeometrySpace): number => {
    if (space === "rows") return rowGeometry.getMapper().rowPosition(viewIndex);
    if (space === "viewport") return rowGeometry.getRowViewportTop(viewIndex);
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
    return resolveScrollTarget({
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
      from: {
        scrollTop: from?.scrollTop ?? scrollTopOf(),
        scrollLeft,
      },
    });
  };

  const service: GridGeometryService = {
    get revision() {
      return revision;
    },
    refresh: () => {
      rowGeometry.syncAxis();
      syncDimensions();
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
      const axis = rowGeometry.getAxis();
      const geometry = resolveColumnGeometry();

      // The point arrives in DOM/viewport px; the axis is addressed in
      // logical content px, so the sample is mapped before the lookup.
      const logicalScrollTop = rowGeometry.getMapper().toLogicalScrollTop(domScrollTop);
      const row = axis.count === 0 ? -1 : axis.indexAt(point.y + logicalScrollTop);
      const displayIndex = geometry.columns.length === 0
        ? -1
        : geometry.displayedAt(point.x, scrollLeft);
      const column = geometry.columns[displayIndex];
      return {
        row: clampRowSentinel(row, axis.count),
        displayIndex,
        col: column?.layoutIndex ?? -1,
        columnId: column?.columnId,
        region: column?.region ?? null,
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

const clampRowSentinel = (row: number, count: number): number => {
  if (count === 0) return -1;
  return Math.min(Math.max(row, -1), count);
};
