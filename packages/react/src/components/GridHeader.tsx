// packages/react/src/components/GridHeader.tsx

import React from "react";
import type { GridCore, ColumnDefinition, Row, SortDirection, HeaderData, VisibleColumnInfo } from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { ReactHeaderRenderer } from "../types";

export interface GridHeaderProps<TData extends Row = Row> {
  headerHeight: number;
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  isLoading: boolean;
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnPositions: number[];
  columnWidths: number[];
  headers: Map<number, HeaderData>;
  sortingEnabled: boolean;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: React.MouseEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: React.MouseEvent) => void;
  coreRef: React.RefObject<GridCore<TData> | null>;
  outerContainerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: Record<string, ReactHeaderRenderer>;
  globalHeaderRenderer?: ReactHeaderRenderer;
}

export const GridHeader = <TData extends Row = Row>(
  props: GridHeaderProps<TData>,
): React.ReactNode => {
  const {
    headerHeight,
    scrollLeft,
    contentWidth,
    totalWidth,
    isLoading,
    visibleColumnsWithIndices,
    columnPositions,
    columnWidths,
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
        {visibleColumnsWithIndices.map(({ column, originalIndex }, visibleIndex) => {
          const headerInfo = headers.get(originalIndex);
          const colW = columnWidths[visibleIndex] ?? 0;
          return (
            <div
              key={column.colId ?? column.field}
              className="gp-grid-header-cell"
              data-col-index={originalIndex}
              style={{
                left: `${columnPositions[visibleIndex]}px`,
                width: `${colW}px`,
                height: `${headerHeight}px`,
              }}
              onMouseDown={(e) =>
                onHeaderMouseDown(originalIndex, colW, headerHeight, e)
              }
            >
              {renderHeader({
                column,
                colIndex: originalIndex,
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
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onHeaderResizeMouseDown(originalIndex, colW, e);
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
