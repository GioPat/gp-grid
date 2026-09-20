// packages/react/src/components/GridHeader.tsx

import React from "react";
import type { GridCore, ColumnDefinition, SortDirection, HeaderData, DisplayedColumn } from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { ReactHeaderRenderer } from "../types";

export interface GridHeaderProps<TData = unknown> {
  headerHeight: number;
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  isLoading: boolean;
  layoutColumns: readonly DisplayedColumn[];
  headers: Map<string, HeaderData>;
  sortingEnabled: boolean;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: React.PointerEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: React.PointerEvent) => void;
  coreRef: React.RefObject<GridCore<TData> | null>;
  outerContainerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: Record<string, ReactHeaderRenderer>;
  globalHeaderRenderer?: ReactHeaderRenderer;
}

export const GridHeader = <TData = unknown>(
  props: GridHeaderProps<TData>,
): React.ReactNode => {
  const {
    headerHeight,
    scrollLeft,
    contentWidth,
    totalWidth,
    isLoading,
    layoutColumns,
    headers,
    sortingEnabled,
    onHeaderMouseDown,
    onHeaderResizeMouseDown,
    coreRef,
    outerContainerRef,
    headerRenderers,
    globalHeaderRenderer,
  } = props;

  return (
    <div
      className={`gp-grid-header${isLoading ? " gp-grid-header--loading" : ""}`}
      style={{ height: headerHeight }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translateX(${-scrollLeft}px)`,
          width: Math.max(contentWidth, totalWidth),
          height: headerHeight,
        }}
      >
        {layoutColumns.map(({ column, layoutIndex, offset, width }) => {
          const headerInfo = headers.get(column.colId ?? column.field);
          return (
            <div
              key={column.colId ?? column.field}
              className="gp-grid-header-cell"
              data-col-index={layoutIndex}
              style={{
                left: `${offset}px`,
                width: `${width}px`,
                height: `${headerHeight}px`,
              }}
              onPointerDown={(e) =>
                onHeaderMouseDown(layoutIndex, width, headerHeight, e)
              }
            >
              {renderHeader({
                column,
                colIndex: layoutIndex,
                sortDirection: headerInfo?.sortDirection,
                sortIndex: headerInfo?.sortIndex,
                sortable: (column.sortable !== false) && sortingEnabled,
                filterable: column.filterable !== false,
                hasFilter: headerInfo?.hasFilter ?? false,
                coreRef,
                containerRef: outerContainerRef,
                headerRenderers,
                globalHeaderRenderer,
              })}
              {column.resizable !== false && (
                <div
                  className="gp-grid-header-resize-handle"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onHeaderResizeMouseDown(layoutIndex, width, e);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
