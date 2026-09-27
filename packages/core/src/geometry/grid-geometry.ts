// packages/core/src/geometry/grid-geometry.ts
// The numeric geometry authority. Composes the row view (axis, regions, bounds,
// hits, vertical target) and the column view (layout, window, placement) into
// the read-only query surface, and owns the geometry revision. All inputs are
// injected callbacks.

import type { ColumnDefinition } from "../types/columns";
import type {
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  ContentSize,
  GridGeometry,
  ScrollTarget,
  ViewportPoint,
} from "../types/geometry";
import { createGeometryRevision } from "./geometry-revision";
import { createGridColumnView, type GridColumnView } from "./grid-column-view";
import { createGridRowView } from "./grid-row-queries";
import type { CellBoundsColumn, FrozenRowsRequest, GridRowView } from "./grid-row-queries";
import type { PlacedRowSize } from "./override-axis";
import type { RowGeometry, RowGeometryDeps, RowScrollMapping } from "./row-geometry";
import type { RowRegionLayout } from "./row-regions";
import { resolveScrollLeft } from "./scroll-target";
import type { GridViewportSample } from "./viewport-sample";

export type { GridViewportSample } from "./viewport-sample";
export type { FrozenRowsRequest } from "./grid-row-queries";

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
  /** Application-set row sizes; absent while none is placed (D2/D3). */
  getPlacedRowSizes?: () => readonly PlacedRowSize[];
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

const isRowIndex = (viewIndex: number, count: number): boolean =>
  Number.isSafeInteger(viewIndex) && viewIndex >= 0 && viewIndex < count;

export const createGridGeometry = (
  deps: GridGeometryDeps,
  initialMode: ColumnLayoutMode,
): GridGeometryService => {
  const revision = createGeometryRevision();

  /** Hoisted: the column view reads the sample the row view normalizes. */
  function getViewportSample(): GridViewportSample {
    return rowView.getViewportSample();
  }

  const columns: GridColumnView = createGridColumnView(
    {
      getColumns: () => deps.getColumns(),
      isWidthOverridden: (layoutIndex) => deps.isWidthOverridden(layoutIndex),
      getViewport: getViewportSample,
      getColumnOverscan: () => deps.getColumnOverscan(),
      onLayoutChange: () => revision.bump(),
    },
    initialMode,
  );

  const rowView: GridRowView = createGridRowView({
    getRowCount: () => deps.getRowCount(),
    getRowHeight: () => deps.getRowHeight(),
    getOverscan: () => deps.getOverscan(),
    getViewport: () => deps.getViewport(),
    getScrollMapping: () => deps.getScrollMapping(),
    getFrozenRowsRequest: deps.getFrozenRowsRequest,
    getPlacedRowSizes: deps.getPlacedRowSizes,
    createRowGeometry: deps.createRowGeometry,
    getDisplayedColumn: (layoutIndex, space): CellBoundsColumn | undefined => {
      const column = columns.getDisplayed(layoutIndex);
      if (column === undefined) return undefined;
      return {
        columnId: column.columnId,
        left: columns.leftOf(column, space),
        width: column.width,
      };
    },
  });

  /** Commit the row axis before the windows it produces. */
  const commitRowAxis = (): void => {
    revision.observeIdentity("rowAxis", rowView.syncAxis());
  };

  const refreshWindows = (): void => {
    revision.observeWindow("rows", rowView.getRowGeometry().getWindow());
    revision.observeWindow("rowsVisible", rowView.getRowGeometry().getVisibleWindow());
  };

  const getScrollTarget = (
    viewIndex: number,
    layoutIndex: number,
    from?: { scrollTop?: number; scrollLeft?: number },
  ): ScrollTarget => {
    rowView.syncAxis();
    const axis = rowView.getAxis();
    const column = columns.getDisplayed(layoutIndex);
    if (column === undefined || isRowIndex(viewIndex, axis.count) === false) return {};
    const scrollLeft = from?.scrollLeft ?? columns.scrollLeftOf();
    const scrollTop = from?.scrollTop ?? rowView.getEffectiveScrollTop();
    // Horizontal rules are region-independent; the vertical target resolves
    // against the row's own clip, so a frozen row never moves (C6).
    const scrollLeftTarget = resolveScrollLeft({
      layout: columns.getLayout(),
      column,
      region: column.region,
      // The target is a displayed column, so the clip lookup cannot miss.
      centerClip: columns.clipOf(layoutIndex)!,
      viewport: getViewportSample(),
      from: { scrollTop, scrollLeft },
    });
    const target: { scrollTop?: number; scrollLeft?: number } = {};
    const vertical = rowView.getScrollTop(viewIndex, scrollTop);
    if (vertical !== undefined) target.scrollTop = vertical;
    if (scrollLeftTarget !== undefined) target.scrollLeft = scrollLeftTarget;
    return target;
  };

  const service: GridGeometryService = {
    get revision() {
      return revision.get();
    },
    refresh: () => {
      commitRowAxis();
      const sample = getViewportSample();
      revision.observeDimensions(sample.width, sample.height);
      service.syncRowRegions();
      refreshWindows();
      return columns.getLayout();
    },
    syncWindows: () => {
      commitRowAxis();
      refreshWindows();
    },
    syncColumnWindow: () => {
      const moved = columns.commitWindow();
      // A window move is a real geometry change (B6): the same revision
      // invalidation a row-window move triggers.
      if (moved) revision.bump();
      return moved;
    },
    setColumnLayoutMode: (mode) => {
      columns.setMode(mode);
    },
    getColumnLayoutMode: () => columns.getMode(),
    getColumnLayout: () => columns.getLayout(),
    getColumnWindow: () => columns.window(),
    getRowWindow: () => {
      service.syncWindows();
      return rowView.getRowGeometry().getWindow();
    },
    getVisibleRowWindow: () => {
      service.syncWindows();
      return rowView.getRowGeometry().getVisibleWindow();
    },
    getRowGeometry: () => rowView.getRowGeometry(),
    syncRowRegions: () => {
      const previous = rowView.getRegionLayout();
      const next = rowView.syncRowRegions();
      // A region move is a committed geometry dependency (C9): clips, hits
      // and slots all read it, so it advances the batch revision.
      if (next !== previous) revision.bump();
      return next;
    },
    getRowRegions: () => rowView.getRegionLayout(),
    getRowClip: (viewIndex) => rowView.getRowClip(viewIndex),
    getRowScrollRange: () => rowView.getRowScrollRange(),
    hasVerticalScrollRange: () => rowView.hasVerticalScrollRange(),
    getRowScrollEdges: (scrollTop, containerHeight) =>
      rowView.getRowScrollEdges(scrollTop, containerHeight),
    retainColumns: (key, columnIds) => {
      columns.retain(key, columnIds);
    },
    releaseColumns: (key) => {
      columns.retain(key, []);
    },
    getEffectiveScroll: () => ({
      scrollTop: rowView.getEffectiveScrollTop(),
      scrollLeft: columns.scrollLeftOf(),
    }),
    getRowBounds: (viewIndex, space = "viewport") => rowView.getRowBounds(viewIndex, space),
    getColumnBounds: (layoutIndex, space = "viewport") => columns.boundsOf(layoutIndex, space),
    getColumn: (layoutIndex) => columns.getDisplayed(layoutIndex),
    getColumnClip: (layoutIndex) => columns.clipOf(layoutIndex),
    getCenterClip: () => columns.centerClip(),
    getCellBounds: (viewIndex, layoutIndex, space = "viewport") =>
      rowView.getCellBounds(viewIndex, layoutIndex, space),
    getRowEdgeOffset: (boundaryIndex, space = "viewport") =>
      rowView.getRowGeometry().getRowEdgeOffset(boundaryIndex, space),
    hitTest: (point: ViewportPoint) => {
      const scrollLeft = Number.isFinite(point.scrollLeft)
        ? columns.clampScrollLeft(point.scrollLeft!)
        : columns.scrollLeftOf();
      rowView.syncAxis();
      const geometry = columns.getGeometry();
      const rowHit = rowView.hitTestRow(point);
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
      rowView.syncAxis();
      return {
        width: columns.getLayout().totalWidth,
        height: rowView.getAxis().extent,
        coordinateSpace: "content",
      };
    },
  };
  return service;
};
