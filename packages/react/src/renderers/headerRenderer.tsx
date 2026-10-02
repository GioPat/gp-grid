// packages/react/src/renderers/headerRenderer.tsx

import React from "react";
import type {
  GridCore,
  GridIcon,
  ColumnDefinition,
  ColumnGroupDefinition,
  ColumnGroupHeaderParams,
  ColumnPin,
  GridLabels,
  HeaderFragment,
  ResolvedColumn,
  SortDirection,
  HeaderRendererParams,
} from "@gp-grid/core";
import type {
  ReactGroupHeaderRenderer,
  ReactHeaderRenderer,
  ReactHeaderRendererRegistry,
} from "../types";

const needsDistinctValues = (column: ColumnDefinition): boolean => {
  const dataType = column.cellDataType;
  return (
    dataType === "text" ||
    dataType === "boolean" ||
    dataType === "object"
  );
};

export interface RenderHeaderOptions<TData> {
  column: ColumnDefinition;
  colIndex: number;
  sortDirection?: SortDirection;
  sortIndex?: number;
  sortable: boolean;
  filterable: boolean;
  hasFilter: boolean;
  rtl: boolean;
  /** Resolved labels used by the default header controls. */
  labels: GridLabels;
  pinIcon: GridIcon;
  coreRef: React.RefObject<GridCore<TData> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  headerRenderers: ReactHeaderRendererRegistry;
  globalHeaderRenderer?: ReactHeaderRenderer;
}

/** Requested pin of the header's column; `null` while unpinned. */
const pinOf = (column: ColumnDefinition): ColumnPin | null => column.pinned ?? null;

/** Return the next physical pin position in the default control's cycle. */
const nextPin = (pinned: ColumnPin | null, rtl: boolean): ColumnPin | null => {
  const left: ColumnPin = rtl ? "end" : "start";
  const right: ColumnPin = rtl ? "start" : "end";
  if (pinned === null) return left;
  if (pinned === left) return right;
  return null;
};

/** Describe the action performed by the next click. */
const nextPinLabel = (
  pinned: ColumnPin | null,
  rtl: boolean,
  labels: GridLabels,
): string => {
  const left: ColumnPin = rtl ? "end" : "start";
  if (pinned === null) return labels.pinLeftColumn;
  if (pinned === left) return labels.pinRightColumn;
  return labels.unpinColumn;
};

/**
 * Render header content based on column configuration and renderer registries
 */
export function renderHeader<TData>(
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
    rtl,
    labels,
    pinIcon,
    coreRef,
    containerRef,
    headerRenderers,
    globalHeaderRenderer,
  } = options;

  const core = coreRef.current;
  const params: HeaderRendererParams = {
    column,
    columnId: column.colId ?? column.field,
    colIndex,
    sortDirection,
    sortIndex,
    sortable,
    filterable,
    hasFilter,
    pinned: pinOf(column),
    onSort: (direction, addToExisting) => {
      if (core && sortable) {
        core.sortFilter.setSort(column.colId ?? column.field, direction, addToExisting);
      }
    },
    onPinChange: (pinned) => {
      core?.columns.setPinned(column.colId ?? column.field, pinned);
    },
    onFilterClick: () => {
      if (core && filterable) {
        const headerCell = containerRef.current?.querySelector(
          `[data-col-index="${colIndex}"]`,
        ) as HTMLElement | null;
        if (headerCell) {
          const rect = headerCell.getBoundingClientRect();
          core.sortFilter.openFilterPopup(
            colIndex,
            {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
            needsDistinctValues(column),
          );
        }
      }
    },
  };

  // Check for column-specific renderer
  if (column.headerRenderer) {
    if (typeof column.headerRenderer === "function") {
      return column.headerRenderer(params) as React.ReactNode;
    }
    const renderer = headerRenderers[column.headerRenderer] as ReactHeaderRenderer | undefined;
    if (renderer) {
      return renderer(params);
    }
  }

  // Fall back to global renderer
  if (globalHeaderRenderer) {
    return globalHeaderRenderer(params);
  }

  // Default header controls
  const pinLabel = nextPinLabel(params.pinned, rtl, labels);
  return (
    <>
      <button
        type="button"
        className={`gp-grid-pin-button${params.pinned !== null ? " active" : ""}`}
        aria-label={pinLabel}
        aria-pressed={params.pinned !== null}
        title={pinLabel}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          params.onPinChange(nextPin(params.pinned, rtl));
        }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox={pinIcon.viewBox ?? "0 0 24 24"}>
          <path d={pinIcon.path} fill="currentColor" />
        </svg>
      </button>
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
            onPointerDown={(e) => {
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
              <path d="M4 4h16l-6 8v5l-4 2v-7L4 4z" />
            </svg>
          </span>
        )}
      </span>
    </>
  );
}

export interface RenderGroupHeaderOptions {
  fragment: HeaderFragment;
  /** The definition: from the core, or from the `columnGroups` prop before the core exists. */
  group: ColumnGroupDefinition | undefined;
  /** `ColumnLayoutSnapshot.columns`, which the fragment's leaves index. */
  layoutColumns: readonly ResolvedColumn[];
  headerRenderers: ReactHeaderRendererRegistry;
}

const resolveGroupRenderer = (
  group: ColumnGroupDefinition,
  headerRenderers: ReactHeaderRendererRegistry,
): ReactGroupHeaderRenderer | undefined => {
  const { headerRenderer } = group;
  if (typeof headerRenderer === "function") {
    return (params) => headerRenderer(params) as React.ReactNode;
  }
  if (headerRenderer === undefined) return undefined;
  return headerRenderers[headerRenderer] as ReactGroupHeaderRenderer | undefined;
};

const groupHeaderParams = (
  fragment: HeaderFragment,
  group: ColumnGroupDefinition,
  layoutColumns: readonly ResolvedColumn[],
): ColumnGroupHeaderParams => ({
  group,
  groupId: fragment.groupId,
  band: fragment.band,
  region: fragment.region,
  leafCount: fragment.leafCount,
  columnIds: layoutColumns
    .slice(fragment.firstDisplayIndex, fragment.firstDisplayIndex + fragment.leafCount)
    .map((column) => column.columnId),
});

/**
 * Render a group fragment through the group's renderer, resolved like a
 * column's, or as its `headerName ?? groupId` text.
 */
export function renderGroupHeader(options: RenderGroupHeaderOptions): React.ReactNode {
  const { fragment, group, layoutColumns, headerRenderers } = options;
  const renderer = group && resolveGroupRenderer(group, headerRenderers);
  if (group && renderer) return renderer(groupHeaderParams(fragment, group, layoutColumns));
  return (
    <span className="gp-grid-header-text">{group?.headerName ?? fragment.groupId}</span>
  );
}
