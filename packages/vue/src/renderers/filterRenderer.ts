// packages/vue/src/renderers/filterRenderer.ts

import { defineComponent, Fragment, h, type PropType, type VNode } from "vue";
import type { ColumnDefinition, FilterClearParams, FilterRendererParams } from "@gp-grid/core";
import type { VueFilterRenderer } from "../types";
import { invokeRenderer } from "./utils";

/** Column renderer (inline or registry key), else the global one; `undefined` keeps the built-in content. */
export const resolveFilterRenderer = (
  column: ColumnDefinition,
  filterRenderers: Record<string, VueFilterRenderer>,
  globalFilterRenderer?: VueFilterRenderer,
): VueFilterRenderer | undefined => {
  const renderer: unknown = column.filterRenderer;
  if (typeof renderer === "string") {
    return filterRenderers[renderer] ?? globalFilterRenderer;
  }
  if (renderer != null) return renderer as VueFilterRenderer;
  return globalFilterRenderer;
};

const renderClear = (renderer: VueFilterRenderer, params: FilterRendererParams): VNode | null => {
  const { clear } = renderer;
  if (clear === null) return null;
  const clearParams: FilterClearParams = {
    clear: () => params.apply(null),
    hasFilter: params.currentFilter !== undefined,
    labels: params.labels,
  };
  const control = clear === "default"
    ? h("button", { type: "button", class: "gp-grid-filter-btn-clear", onClick: clearParams.clear }, params.labels.clear)
    : invokeRenderer(clear, clearParams);
  return h("div", { class: "gp-grid-filter-clear" }, [control]);
};

export const CustomFilterContent = defineComponent({
  name: "GpGridCustomFilterContent",
  props: {
    renderer: { type: Object as PropType<VueFilterRenderer>, required: true },
    params: { type: Object as PropType<FilterRendererParams>, required: true },
  },
  setup: (props) => () => h(Fragment, [
    invokeRenderer(props.renderer.content, props.params),
    renderClear(props.renderer, props.params),
  ]),
});
