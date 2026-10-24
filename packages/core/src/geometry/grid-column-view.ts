// packages/core/src/geometry/grid-column-view.ts
// The column half of the geometry service: the resolved layout and window, the
// displayed column at a layout index and its placement in a coordinate space.
// GridGeometry composes it with the row view.

import type { ColumnDefinition } from "../types/columns";
import type {
  AxisBounds,
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  ColumnWindowSnapshot,
  GeometrySpace,
  ResolvedColumn,
  ResolvedColumnGeometry,
} from "../types/geometry";
import type { ColumnGroupIndex } from "../column-groups/group-index";
import { createHeaderRunsCache, leafDepthOf } from "../column-groups/header-runs";
import { createColumnGeometry } from "./column-geometry";
import {
  createColumnLayoutResolver,
  resolveColumnLayout,
  type ColumnLayoutResolver,
} from "./column-layout";
import { createColumnWindowResolver } from "./column-window";
import type { GridViewportSample } from "./viewport-sample";

export interface GridColumnViewDeps {
  getColumns(): readonly ColumnDefinition[];
  isWidthOverridden(layoutIndex: number): boolean;
  /** Normalized viewport sample, shared with the row view. */
  getViewport(): GridViewportSample;
  getColumnOverscan(): number;
  /** Report a committed layout change; the caller owns the revision value. */
  onLayoutChange(): number;
  /** Active column-group hierarchy; `null` while the grid is flat. */
  getGroupIndex(): ColumnGroupIndex | null;
  /** `columnGroupLimits.maxFragments`. */
  readonly maxFragments: number;
}

export interface GridColumnView {
  setMode(mode: ColumnLayoutMode): void;
  getMode(): ColumnLayoutMode;
  /** Committed layout snapshot; the previous object is reused while it matches. */
  getLayout(): ColumnLayoutSnapshot;
  /** The layout the current inputs give under `index`, resolved without committing it. */
  previewLayout(index: ColumnGroupIndex | null): ColumnLayoutSnapshot;
  getGeometry(): ResolvedColumnGeometry;
  /** Displayed column at a layout index; `undefined` when hidden or invalid. */
  getDisplayed(layoutIndex: number): ResolvedColumn | undefined;
  /** Column start in `space`, from the current scroll sample. */
  leftOf(column: ResolvedColumn, space: GeometrySpace): number;
  /** Column start and end in `space`; `undefined` when hidden or invalid. */
  boundsOf(layoutIndex: number, space: GeometrySpace): AxisBounds | undefined;
  /** Current scroll sample the region mapping reads. */
  scrollLeftOf(): number;
  clampScrollLeft(scrollLeft: number): number;
  /** Commit the column window; true when it moved. */
  commitWindow(): boolean;
  window(): ColumnWindowSnapshot;
  retain(key: string, columnIds: readonly string[]): void;
  /** Clip the column scrolls inside; `undefined` when hidden or invalid. */
  clipOf(layoutIndex: number): AxisBounds | undefined;
  centerClip(): AxisBounds;
}

export const createGridColumnView = (
  deps: GridColumnViewDeps,
  initialMode: ColumnLayoutMode,
): GridColumnView => {
  const layoutResolver: ColumnLayoutResolver = createColumnLayoutResolver(
    initialMode,
    deps.onLayoutChange,
  );

  // Region mapping and center prefixes are rebuilt only when the layout or the
  // viewport width changes, never per scroll sample.
  let cache: { layout: ColumnLayoutSnapshot; geometry: ResolvedColumnGeometry } | null = null;
  // One `depthOf` per hierarchy: its identity is the layout's change signal.
  let depths: { index: ColumnGroupIndex | null; depthOf: (columnId: string) => number } = {
    index: null,
    depthOf: leafDepthOf(null),
  };
  const headerRuns = createHeaderRunsCache(deps.maxFragments);

  const depthOf = (): ((columnId: string) => number) => {
    const index = deps.getGroupIndex();
    if (depths.index !== index) depths = { index, depthOf: leafDepthOf(index) };
    return depths.depthOf;
  };

  const windowResolver = createColumnWindowResolver({
    getLayout: () => view.getLayout(),
    getScrollLeft: () => deps.getViewport().scrollLeft,
    getViewportWidth: () => deps.getViewport().width,
    getOverscan: () => deps.getColumnOverscan(),
    getHeaderRuns: (layout) => headerRuns.get(layout, deps.getGroupIndex()),
  });

  const view: GridColumnView = {
    setMode: (mode) => {
      if (layoutResolver.getMode() === mode) return;
      layoutResolver.setMode(mode);
      // The mode is a committed layout dependency: resolve against it now so
      // the batch reports this revision.
      view.getLayout();
    },
    getMode: () => layoutResolver.getMode(),
    getLayout: () =>
      layoutResolver.update({
        columns: deps.getColumns(),
        mode: layoutResolver.getMode(),
        width: deps.getViewport().width,
        isOverridden: (layoutIndex) => deps.isWidthOverridden(layoutIndex),
        depthOf: depthOf(),
      }),
    previewLayout: (index) =>
      resolveColumnLayout(
        {
          columns: deps.getColumns(),
          mode: layoutResolver.getMode(),
          width: deps.getViewport().width,
          isOverridden: (layoutIndex) => deps.isWidthOverridden(layoutIndex),
          depthOf: leafDepthOf(index),
        },
        null,
        0,
      ),
    getGeometry: () => {
      const layout = view.getLayout();
      if (cache?.layout !== layout) {
        cache = { layout, geometry: createColumnGeometry(layout) };
      }
      return cache.geometry;
    },
    getDisplayed: (layoutIndex) => view.getGeometry().byLayoutIndex.get(layoutIndex),
    leftOf: (column, space) => {
      if (space !== "viewport") return column.offset;
      const scrollLeft = view.scrollLeftOf();
      return view.getGeometry().viewportLeft(column.layoutIndex, scrollLeft) ?? column.offset;
    },
    boundsOf: (layoutIndex, space) => {
      const column = view.getDisplayed(layoutIndex);
      if (column === undefined) return undefined;
      const start = view.leftOf(column, space);
      return { start, end: start + column.width };
    },
    scrollLeftOf: () => windowResolver.getScrollLeft(),
    clampScrollLeft: (scrollLeft) => windowResolver.clampScrollLeft(scrollLeft),
    commitWindow: () => windowResolver.commit(),
    window: () => windowResolver.get(),
    retain: (key, columnIds) => {
      windowResolver.retain(key, columnIds);
    },
    clipOf: (layoutIndex) => view.getGeometry().clip(layoutIndex),
    centerClip: () => {
      const regions = view.getLayout().regions;
      return { start: regions.startWidth, end: regions.startWidth + regions.centerViewportWidth };
    },
  };

  return view;
};
