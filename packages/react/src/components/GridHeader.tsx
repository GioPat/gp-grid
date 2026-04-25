// packages/react/src/components/GridHeader.tsx

import React from "react";
import type {
  GridCore,
  HeaderData,
  VisibleColumnInfo,
  ColumnLayout,
  ColumnLayoutItem,
} from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { ReactHeaderRenderer } from "../types";

export interface GridHeaderProps<TData = unknown> {
  headerHeight: number;
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  isLoading: boolean;
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnLayout: ColumnLayout;
  columnPositions: number[];
  columnWidths: number[];
  headers: Map<number, HeaderData>;
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
    contentWidth,
    isLoading,
    columnLayout,
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
      {renderRegion(columnLayout.leftPinned.items, {
        left: 0,
        width: columnLayout.leftPinnedWidth,
        zIndex: 3,
      })}
      {renderRegion(columnLayout.center.items, {
        left: columnLayout.leftPinnedWidth,
        width: Math.max(columnLayout.centerWidth, contentWidth - columnLayout.leftPinnedWidth - columnLayout.rightPinnedWidth),
        transform: "translate3d(calc(-1 * var(--gp-grid-scroll-left, 0px)), 0, 0)",
        zIndex: 1,
      })}
      {renderRegion(columnLayout.rightPinned.items, {
        right: 0,
        width: columnLayout.rightPinnedWidth,
        zIndex: 3,
      })}
    </div>
  );

  function renderRegion(
    items: ColumnLayoutItem[],
    style: React.CSSProperties,
  ): React.ReactNode {
    return (
      <div
        className="gp-grid-column-region"
        style={{
          position: "absolute",
          top: 0,
          height: headerHeight,
          ...style,
        }}
      >
        {items.map((item) => renderHeaderCell(item))}
      </div>
    );
  }

  function renderHeaderCell(item: ColumnLayoutItem): React.ReactNode {
    const { column, originalIndex } = item;
    const headerInfo = headers.get(originalIndex);
    return (
      <div
        key={item.key}
        className={[
          "gp-grid-header-cell",
          item.region === "left" ? "gp-grid-header-cell--pinned-left" : "",
          item.region === "right" ? "gp-grid-header-cell--pinned-right" : "",
        ].filter(Boolean).join(" ")}
        data-col-index={originalIndex}
        style={{
          left: `${item.left}px`,
          width: `${item.width}px`,
          height: `${headerHeight}px`,
        }}
        onPointerDown={(e) =>
          onHeaderMouseDown(originalIndex, item.width, headerHeight, e)
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
            className={[
              "gp-grid-header-resize-handle",
              item.region === "right" ? "gp-grid-header-resize-handle--inside" : "",
            ].filter(Boolean).join(" ")}
            onPointerDown={(e) => {
              e.stopPropagation();
              onHeaderResizeMouseDown(originalIndex, item.width, e);
            }}
          />
        )}
      </div>
    );
  }
};
