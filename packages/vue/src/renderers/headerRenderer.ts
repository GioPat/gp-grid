// packages/vue/src/renderers/headerRenderer.ts

import { h, Fragment, type VNode } from "vue";
import type {
  GridCore,
  GridIcon,
  ColumnDefinition,
  ColumnGroupDefinition,
  ColumnGroupHeaderParams,
  ColumnPin,
  HeaderFragment,
  ResolvedColumn,
  SortDirection,
  HeaderRendererParams,
  GridLabels,
} from "@gp-grid/core";
import type { VueGroupHeaderRenderer, VueHeaderRenderer, VueHeaderRendererRegistry } from "../types";
import { invokeRenderer } from "./utils";

const needsDistinctValues = (column: ColumnDefinition): boolean => {
  const dataType = column.cellDataType;
  return (
    dataType === "text" ||
    dataType === "boolean" ||
    dataType === "object"
  );
};

export interface RenderHeaderOptions {
  column: ColumnDefinition;
  colIndex: number;
  sortDirection?: SortDirection;
  sortIndex?: number;
  sortable: boolean;
  filterable: boolean;
  hasFilter: boolean;
  rtl: boolean;
  labels: GridLabels;
  pinIcon: GridIcon;
  core: GridCore | null;
  container: HTMLDivElement | null;
  headerRenderers: VueHeaderRendererRegistry;
  globalHeaderRenderer?: VueHeaderRenderer;
}

const nextPin = (pinned: ColumnPin | null, rtl: boolean): ColumnPin | null => {
  const left: ColumnPin = rtl ? "end" : "start";
  const right: ColumnPin = rtl ? "start" : "end";
  if (pinned === null) return left;
  if (pinned === left) return right;
  return null;
};

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
export function renderHeader(
  options: RenderHeaderOptions,
): VNode {
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
    core,
    container,
    headerRenderers,
    globalHeaderRenderer,
  } = options;
  const params: HeaderRendererParams = {
    column,
    columnId: column.colId ?? column.field,
    colIndex,
    sortDirection,
    sortIndex,
    sortable,
    filterable,
    hasFilter,
    pinned: column.pinned ?? null,
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
        const headerCell = container?.querySelector(
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
  if (column.headerRenderer != null) {
    if (typeof column.headerRenderer === "string") {
      const renderer = headerRenderers[column.headerRenderer] as VueHeaderRenderer | undefined;
      if (renderer) {
        return invokeRenderer(renderer, params);
      }
    } else {
      return invokeRenderer(column.headerRenderer as VueHeaderRenderer, params);
    }
  }

  // Fall back to global renderer
  if (globalHeaderRenderer) {
    return invokeRenderer(globalHeaderRenderer, params);
  }

  // Default header controls
  const isPinned = params.pinned !== null;
  const pinLabel = nextPinLabel(params.pinned, rtl, labels);
  const pinButton = h(
    "button",
    {
      type: "button",
      class: `gp-grid-pin-button${isPinned ? " active" : ""}`,
      "aria-label": pinLabel,
      "aria-pressed": isPinned,
      title: pinLabel,
      onPointerdown: (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
      },
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        params.onPinChange(nextPin(params.pinned, rtl));
      },
    },
    [
      h(
        "svg",
        { "aria-hidden": "true", width: "16", height: "16", viewBox: pinIcon.viewBox ?? "0 0 24 24" },
        [h("path", { d: pinIcon.path, fill: "currentColor" })],
      ),
    ],
  );
  const children: VNode[] = [
    pinButton,
    h("span", { class: "gp-grid-header-text" }, column.headerName ?? column.field),
  ];

  const iconsChildren: VNode[] = [];

  // Stacked sort arrows - always show when sortable
  if (sortable) {
    const arrowsChildren: VNode[] = [
      h("span", { class: "gp-grid-sort-arrows-stack" }, [
        h(
          "svg",
          {
            class: `gp-grid-sort-arrow-up${sortDirection === "asc" ? " active" : ""}`,
            width: "8",
            height: "6",
            viewBox: "0 0 8 6",
          },
          [h("path", { d: "M4 0L8 6H0L4 0Z", fill: "currentColor" })],
        ),
        h(
          "svg",
          {
            class: `gp-grid-sort-arrow-down${sortDirection === "desc" ? " active" : ""}`,
            width: "8",
            height: "6",
            viewBox: "0 0 8 6",
          },
          [h("path", { d: "M4 6L0 0H8L4 6Z", fill: "currentColor" })],
        ),
      ]),
    ];

    if (sortIndex !== undefined && sortIndex > 0) {
      arrowsChildren.push(h("span", { class: "gp-grid-sort-index" }, String(sortIndex)));
    }

    iconsChildren.push(h("span", { class: "gp-grid-sort-arrows" }, arrowsChildren));
  }

  // Filter icon
  if (filterable) {
    iconsChildren.push(
      h(
        "span",
        {
          class: `gp-grid-filter-icon${hasFilter ? " active" : ""}`,
          onPointerdown: (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            params.onFilterClick();
          },
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
          },
        },
        [
          h(
            "svg",
            { width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor" },
            [h("path", { d: "M4 4h16l-6 8v5l-4 2v-7L4 4z" })],
          ),
        ],
      ),
    );
  }

  if (iconsChildren.length > 0) {
    children.push(h("span", { class: "gp-grid-header-icons" }, iconsChildren));
  }

  return h(Fragment, children);
}

export interface RenderGroupHeaderOptions {
  fragment: HeaderFragment;
  /** The definition: from the core, or from the `columnGroups` prop before the core exists. */
  group: ColumnGroupDefinition | undefined;
  /** `ColumnLayoutSnapshot.columns`, which the fragment's leaves index. */
  layoutColumns: readonly ResolvedColumn[];
  headerRenderers: VueHeaderRendererRegistry;
}

const resolveGroupRenderer = (
  group: ColumnGroupDefinition,
  headerRenderers: VueHeaderRendererRegistry,
): VueGroupHeaderRenderer | undefined => {
  const { headerRenderer } = group;
  if (typeof headerRenderer === "function") {
    return (params) => headerRenderer(params) as VNode | string | null;
  }
  if (headerRenderer === undefined) return undefined;
  return headerRenderers[headerRenderer] as VueGroupHeaderRenderer | undefined;
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
export function renderGroupHeader(options: RenderGroupHeaderOptions): VNode {
  const { fragment, group, layoutColumns, headerRenderers } = options;
  const renderer = group && resolveGroupRenderer(group, headerRenderers);
  if (group && renderer) {
    return invokeRenderer(renderer, groupHeaderParams(fragment, group, layoutColumns));
  }
  return h("span", { class: "gp-grid-header-text" }, group?.headerName ?? fragment.groupId);
}
