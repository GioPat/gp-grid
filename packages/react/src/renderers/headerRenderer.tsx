// packages/react/src/renderers/headerRenderer.tsx

import React from "react";
import type { GridCore, ColumnDefinition, Row, SortDirection, HeaderRendererParams } from "gp-grid-core";
import type { ReactHeaderRenderer } from "../types";

export interface RenderHeaderOptions<TData extends Row> {
  column: ColumnDefinition;
  colIndex: number;
  sortDirection?: SortDirection;
  sortIndex?: number;
  sortable: boolean;
  filterable: boolean;
  hasFilter: boolean;
  coreRef: React.RefObject<GridCore<TData> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: Record<string, ReactHeaderRenderer>;
  globalHeaderRenderer?: ReactHeaderRenderer;
}

/**
 * Render header content based on column configuration and renderer registries
 */
export function renderHeader<TData extends Row>(
  options: RenderHeaderOptions<TData>,
): React.ReactNode {
  const {
    column,
    colIndex,
    sortDirection,
    sortIndex,
    sortable,
    filterable,
    hasFilter,
    coreRef,
    containerRef,
    headerRenderers,
    globalHeaderRenderer,
  } = options;

  const core = coreRef.current;
  const params: HeaderRendererParams = {
    column,
    colIndex,
    sortDirection,
    sortIndex,
    sortable,
    filterable,
    hasFilter,
    onSort: (direction, addToExisting) => {
      if (core && sortable) {
        core.setSort(column.colId ?? column.field, direction, addToExisting);
      }
    },
    onFilterClick: () => {
      if (core && filterable) {
        const headerCell = containerRef.current?.querySelector(
          `[data-col-index="${colIndex}"]`,
        ) as HTMLElement | null;
        if (headerCell) {
          const rect = headerCell.getBoundingClientRect();
          core.openFilterPopup(colIndex, {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
        }
      }
    },
  };

  // Check for column-specific renderer
  if (column.headerRenderer && typeof column.headerRenderer === "string") {
    const renderer = headerRenderers[column.headerRenderer];
    if (renderer) {
      return renderer(params);
    }
  }

  // Fall back to global renderer
  if (globalHeaderRenderer) {
    return globalHeaderRenderer(params);
  }

  // Default header with stacked sort arrows and filter icon
  return (
    <>
      <span className="gp-grid-header-text">
        {column.headerName ?? column.field}
      </span>
      <span className="gp-grid-header-icons">
        {/* Stacked sort arrows - always show when sortable */}
        {sortable && (
          <span className="gp-grid-sort-arrows">
            <span className="gp-grid-sort-arrows-stack">
              <svg
                className={`gp-grid-sort-arrow-up${sortDirection === "asc" ? " active" : ""}`}
                width="8"
                height="6"
                viewBox="0 0 8 6"
              >
                <path d="M4 0L8 6H0L4 0Z" fill="currentColor" />
              </svg>
              <svg
                className={`gp-grid-sort-arrow-down${sortDirection === "desc" ? " active" : ""}`}
                width="8"
                height="6"
                viewBox="0 0 8 6"
              >
                <path d="M4 6L0 0H8L4 6Z" fill="currentColor" />
              </svg>
            </span>
            {sortIndex !== undefined && sortIndex > 0 && (
              <span className="gp-grid-sort-index">{sortIndex}</span>
            )}
          </span>
        )}
        {/* Filter icon - MUI FilterList style */}
        {filterable && (
          <span
            className={`gp-grid-filter-icon${hasFilter ? " active" : ""}`}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              params.onFilterClick();
            }}
            onClick={(e) => {
              // Prevent click from triggering header sort
              e.stopPropagation();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
            </svg>
          </span>
        )}
      </span>
    </>
  );
}
