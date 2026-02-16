// packages/vue/src/renderers/headerRenderer.ts

import { h, Fragment, createTextVNode, type VNode } from "vue";
import type { GridCore, ColumnDefinition, SortDirection, HeaderRendererParams } from "@gp-grid/core";
import type { VueHeaderRenderer } from "../types";
import { toVNode } from "./utils";

export interface RenderHeaderOptions {
  column: ColumnDefinition;
  colIndex: number;
  sortDirection?: SortDirection;
  sortIndex?: number;
  sortable: boolean;
  filterable: boolean;
  hasFilter: boolean;
  core: GridCore | null;
  container: HTMLDivElement | null;
  headerRenderers: Record<string, VueHeaderRenderer>;
  globalHeaderRenderer?: VueHeaderRenderer;
}

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
    core,
    container,
    headerRenderers,
    globalHeaderRenderer,
  } = options;
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
        const headerCell = container?.querySelector(
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
      return toVNode(renderer(params));
    }
  }

  // Fall back to global renderer
  if (globalHeaderRenderer) {
    return toVNode(globalHeaderRenderer(params));
  }

  // Default header with stacked sort arrows and filter icon
  const children: VNode[] = [
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
          onMousedown: (e: MouseEvent) => {
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
