// packages/react/src/components/GridHeader.tsx

import React from "react";
import type {
  ColumnWindowSnapshot,
  GridCore,
  GridIcon,
  GridLabels,
  HeaderData,
  ResolvedColumn,
} from "@gp-grid/core";
import { GridHeaderCell } from "./GridHeaderCell";
import type { ReactHeaderRenderer } from "../types";

export interface GridHeaderProps<TData = unknown> {
  headerHeight: number;
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
  labels: GridLabels;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: React.PointerEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: React.PointerEvent) => void;
  coreRef: React.RefObject<GridCore<TData> | null>;
  outerContainerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: Record<string, ReactHeaderRenderer>;
  globalHeaderRenderer?: ReactHeaderRenderer;
  pinIcon: GridIcon;
}

/**
 * Header: the center strip translates with the body scroll, while the two pin
 * containers stay absolute at their viewport edges above it.
 */
export const GridHeader = <TData = unknown>(
  props: GridHeaderProps<TData>,
): React.ReactNode => {
  const {
    headerHeight,
    scrollLeft,
    contentWidth,
    totalWidth,
    viewportWidth,
    isLoading,
    columnWindow,
    displayedIndexOf,
    headers,
    sortingEnabled,
    labels,
    onHeaderMouseDown,
    onHeaderResizeMouseDown,
    coreRef,
    outerContainerRef,
    headerRenderers,
    globalHeaderRenderer,
    pinIcon,
  } = props;

  const renderColumn = (column: ResolvedColumn): React.ReactNode => (
    <GridHeaderCell
      key={column.columnId}
      column={column}
      displayedIndex={displayedIndexOf(column.columnId)}
      headerHeight={headerHeight}
      headers={headers}
      sortingEnabled={sortingEnabled}
      labels={labels}
      onHeaderMouseDown={onHeaderMouseDown}
      onHeaderResizeMouseDown={onHeaderResizeMouseDown}
      coreRef={coreRef}
      outerContainerRef={outerContainerRef}
      headerRenderers={headerRenderers}
      globalHeaderRenderer={globalHeaderRenderer}
      pinIcon={pinIcon}
    />
  );

  const { start, center, end } = columnWindow ?? { start: [], center: [], end: [] };
  const { regions } = columnWindow?.layout ?? {};

  return (
    <div
      className={`gp-grid-header${isLoading ? " gp-grid-header--loading" : ""}`}
      role="row"
      style={{ height: headerHeight }}
    >
      <div
        role="presentation"
        style={{
          position: "absolute",
          top: 0,
          insetInlineStart: 0,
          transform: `translateX(${-scrollLeft}px)`,
          width: Math.max(contentWidth, totalWidth),
          height: headerHeight,
        }}
      >
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
            height: headerHeight,
          }}
        >
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
            height: headerHeight,
          }}
        >
          {end.map(renderColumn)}
        </div>
      )}

      {viewportWidth > 0 && (
        <div
          className="gp-grid-header-gutter"
          role="presentation"
          style={{ insetInlineStart: viewportWidth, height: headerHeight }}
        />
      )}
    </div>
  );
};
