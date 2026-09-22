// packages/react/src/components/GridHeaderCell.tsx

import React from "react";
import type {
  GridCore,
  GridIcon,
  GridLabels,
  HeaderData,
  ResolvedColumn,
} from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { ReactHeaderRenderer } from "../types";

export interface GridHeaderCellProps<TData = unknown> {
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  headerHeight: number;
  headers: Map<string, HeaderData>;
  sortingEnabled: boolean;
  labels: GridLabels;
  onHeaderMouseDown: (
    colIndex: number,
    colWidth: number,
    colHeight: number,
    e: React.PointerEvent,
  ) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: React.PointerEvent) => void;
  coreRef: React.RefObject<GridCore<TData> | null>;
  outerContainerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: Record<string, ReactHeaderRenderer>;
  globalHeaderRenderer?: ReactHeaderRenderer;
  pinIcon: GridIcon;
}

/** One header cell: region-local `insetInlineStart`, renderer and resize handle. */
export const GridHeaderCell = <TData = unknown>(
  props: GridHeaderCellProps<TData>,
): React.ReactNode => {
  const {
    column,
    displayedIndex,
    headerHeight,
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

  const { column: definition, layoutIndex, width, regionOffset } = column;
  const headerInfo = headers.get(column.columnId);

  return (
    <div
      className="gp-grid-header-cell"
      role="columnheader"
      aria-colindex={displayedIndex + 1}
      data-col-index={layoutIndex}
      data-cell-region={column.region}
      style={{
        insetInlineStart: `${regionOffset}px`,
        width: `${width}px`,
        height: `${headerHeight}px`,
      }}
      onPointerDown={(e) => onHeaderMouseDown(layoutIndex, width, headerHeight, e)}
    >
      {renderHeader({
        column: definition,
        colIndex: layoutIndex,
        sortDirection: headerInfo?.sortDirection,
        sortIndex: headerInfo?.sortIndex,
        sortable: definition.sortable !== false && sortingEnabled,
        filterable: definition.filterable !== false,
        hasFilter: headerInfo?.hasFilter ?? false,
        labels,
        coreRef,
        containerRef: outerContainerRef,
        headerRenderers,
        globalHeaderRenderer,
        pinIcon,
      })}
      {definition.resizable !== false && (
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
};
