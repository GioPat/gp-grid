// packages/react/src/components/GridHeader.tsx

import React, { useId, useMemo } from "react";
import {
  fragmentHeaderBox,
  fragmentHeaderId,
  leafHeaderBox,
  leafHeaderId,
  resolveHeaderAssociations,
} from "@gp-grid/core";
import type {
  ColumnWindowSnapshot,
  GridCore,
  GridIcon,
  GridLabels,
  HeaderBandLayout,
  HeaderData,
  HeaderFragment,
  ResolvedColumn,
} from "@gp-grid/core";
import { GridHeaderCell } from "./GridHeaderCell";
import type { LeafHeaderBands } from "./GridHeaderCell";
import { GridHeaderGroupCell } from "./GridHeaderGroupCell";
import type { ResizeHandleActions } from "./ResizeHandle";
import type { ReactHeaderRenderer, ReactHeaderRendererRegistry } from "../types";

export interface GridHeaderProps<TData = unknown> {
  headerBands: HeaderBandLayout;
  /** DOM scroll offset (physical: negative in RTL); the strip negates it. */
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  viewportWidth: number;
  isLoading: boolean;
  columnWindow: ColumnWindowSnapshot | null;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  headers: Map<string, HeaderData>;
  sortingEnabled: boolean;
  rtl: boolean;
  labels: GridLabels;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: React.PointerEvent) => void;
  resizeActions: ResizeHandleActions;
  coreRef: React.RefObject<GridCore<TData> | null>;
  outerContainerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: ReactHeaderRendererRegistry;
  globalHeaderRenderer?: ReactHeaderRenderer;
  pinIcon: GridIcon;
}

/**
 * Header: the center strip translates with the body scroll, while the two pin
 * containers stay absolute at their viewport edges above it. With more than
 * one band the root is a row group whose band rows own the mounted headers.
 */
export const GridHeader = <TData = unknown>(
  props: GridHeaderProps<TData>,
): React.ReactNode => {
  const {
    headerBands,
    scrollLeft,
    contentWidth,
    totalWidth,
    viewportWidth,
    isLoading,
    columnWindow,
    displayedIndexOf,
    headers,
    sortingEnabled,
    rtl,
    labels,
    onHeaderMouseDown,
    resizeActions,
    coreRef,
    outerContainerRef,
    headerRenderers,
    globalHeaderRenderer,
    pinIcon,
  } = props;

  const instance = useId();
  const { count: bandCount, totalHeight } = headerBands;
  const associations = useMemo(
    () =>
      bandCount > 1 && columnWindow !== null
        ? resolveHeaderAssociations({ instance, columnWindow, bandCount, displayedIndexOf })
        : null,
    [instance, columnWindow, bandCount, displayedIndexOf],
  );

  const leafBands = (column: ResolvedColumn): LeafHeaderBands | undefined => {
    if (associations === null) return undefined;
    return {
      rowIndex: column.headerBand + 1,
      rowSpan: bandCount - column.headerBand,
      describedBy: associations.describedBy.get(column.columnId),
    };
  };

  const renderColumn = (column: ResolvedColumn): React.ReactNode => (
    <GridHeaderCell
      key={column.columnId}
      column={column}
      displayedIndex={displayedIndexOf(column.columnId)}
      id={leafHeaderId(instance, column.columnId)}
      box={leafHeaderBox(headerBands, column.headerBand)}
      bands={leafBands(column)}
      headers={headers}
      sortingEnabled={sortingEnabled}
      rtl={rtl}
      labels={labels}
      onHeaderMouseDown={onHeaderMouseDown}
      resizeActions={resizeActions}
      coreRef={coreRef}
      outerContainerRef={outerContainerRef}
      headerRenderers={headerRenderers}
      globalHeaderRenderer={globalHeaderRenderer}
      pinIcon={pinIcon}
    />
  );

  const layoutColumns = columnWindow?.layout.columns ?? [];
  const renderFragment = (fragment: HeaderFragment): React.ReactNode => (
    <GridHeaderGroupCell
      key={fragment.fragmentId}
      fragment={fragment}
      id={fragmentHeaderId(instance, fragment.fragmentId)}
      box={fragmentHeaderBox(headerBands, fragment.band)}
      layoutColumns={layoutColumns}
      coreRef={coreRef}
      headerRenderers={headerRenderers}
    />
  );

  const { start, center, end } = columnWindow ?? { start: [], center: [], end: [] };
  const groups = columnWindow?.groups;
  const { regions } = columnWindow?.layout ?? {};

  return (
    <div
      className={`gp-grid-header${isLoading ? " gp-grid-header--loading" : ""}`}
      role={associations === null ? "row" : "rowgroup"}
      aria-rowindex={associations === null ? 1 : undefined}
      style={{ height: totalHeight }}
    >
      {associations?.owns.map((owns, band) => (
        <div
          key={band}
          role="row"
          aria-rowindex={band + 1}
          aria-owns={owns === "" ? undefined : owns}
        />
      ))}

      <div
        role="presentation"
        style={{
          position: "absolute",
          top: 0,
          insetInlineStart: 0,
          transform: `translateX(${-scrollLeft}px)`,
          width: Math.max(contentWidth, totalWidth),
          height: totalHeight,
        }}
      >
        {groups?.center.map(renderFragment)}
        {center.map(renderColumn)}
      </div>

      {regions !== undefined && start.length > 0 && (
        <div
          className="gp-grid-pin-header"
          role="presentation"
          data-pin-region="start"
          style={{
            insetInlineStart: 0,
            width: `${regions.startWidth}px`,
            height: totalHeight,
          }}
        >
          {groups?.start.map(renderFragment)}
          {start.map(renderColumn)}
        </div>
      )}

      {regions !== undefined && end.length > 0 && (
        <div
          className="gp-grid-pin-header"
          role="presentation"
          data-pin-region="end"
          style={{
            insetInlineStart: `${regions.endOffset}px`,
            width: `${regions.endWidth}px`,
            height: totalHeight,
          }}
        >
          {groups?.end.map(renderFragment)}
          {end.map(renderColumn)}
        </div>
      )}

      {viewportWidth > 0 && (
        <div
          className="gp-grid-header-gutter"
          role="presentation"
          style={{ insetInlineStart: viewportWidth, height: totalHeight }}
        />
      )}
    </div>
  );
};
