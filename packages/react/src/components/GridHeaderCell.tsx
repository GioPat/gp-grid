// packages/react/src/components/GridHeaderCell.tsx

import React from "react";
import type {
  GridCore,
  GridIcon,
  GridLabels,
  HeaderBox,
  HeaderData,
  ResolvedColumn,
} from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { ReactHeaderRenderer, ReactHeaderRendererRegistry } from "../types";
import { ResizeHandle } from "./ResizeHandle";
import type { ResizeHandleActions } from "./ResizeHandle";

/** Band placement of a leaf in a grouped header (D9); absent while flat. */
export interface LeafHeaderBands {
  /** 1-based first band. */
  rowIndex: number;
  /** Bands the leaf spans. */
  rowSpan: number;
  /** Ids of its mounted ancestor fragments, outermost first. */
  describedBy: string | undefined;
}

export interface GridHeaderCellProps<TData = unknown> {
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  id: string;
  box: HeaderBox;
  bands?: LeafHeaderBands;
  headers: Map<string, HeaderData>;
  sortingEnabled: boolean;
  rtl: boolean;
  labels: GridLabels;
  onHeaderMouseDown: (
    colIndex: number,
    colWidth: number,
    colHeight: number,
    e: React.PointerEvent,
  ) => void;
  resizeActions: ResizeHandleActions;
  coreRef: React.RefObject<GridCore<TData> | null>;
  outerContainerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: ReactHeaderRendererRegistry;
  globalHeaderRenderer?: ReactHeaderRenderer;
  pinIcon: GridIcon;
}

/** One leaf header cell: region-local `insetInlineStart`, renderer and resize handle. */
export const GridHeaderCell = <TData = unknown>(
  props: GridHeaderCellProps<TData>,
): React.ReactNode => {
  const {
    column,
    displayedIndex,
    id,
    box,
    bands,
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

  const { column: definition, layoutIndex, width, regionOffset } = column;
  const headerInfo = headers.get(column.columnId);
  const className = definition.wrapHeaderText === true
    ? "gp-grid-header-cell gp-grid-header-cell--wrap"
    : "gp-grid-header-cell";

  return (
    <div
      id={id}
      className={className}
      role="columnheader"
      aria-colindex={displayedIndex + 1}
      aria-rowindex={bands?.rowIndex}
      aria-rowspan={bands?.rowSpan}
      aria-describedby={bands?.describedBy}
      data-col-index={layoutIndex}
      data-cell-region={column.region}
      style={{
        insetInlineStart: `${regionOffset}px`,
        width: `${width}px`,
        height: `${box.height}px`,
        top: `${box.top}px`,
      }}
      onPointerDown={(e) => onHeaderMouseDown(layoutIndex, width, box.height, e)}
    >
      {renderHeader({
        column: definition,
        colIndex: layoutIndex,
        sortDirection: headerInfo?.sortDirection,
        sortIndex: headerInfo?.sortIndex,
        sortable: definition.sortable !== false && sortingEnabled,
        filterable: definition.filterable !== false,
        hasFilter: headerInfo?.hasFilter ?? false,
        rtl,
        labels,
        coreRef,
        containerRef: outerContainerRef,
        headerRenderers,
        globalHeaderRenderer,
        pinIcon,
      })}
      {definition.resizable !== false && (
        <ResizeHandle
          axis="column"
          index={layoutIndex}
          size={width}
          actions={resizeActions}
        />
      )}
    </div>
  );
};
