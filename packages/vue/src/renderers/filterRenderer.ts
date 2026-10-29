// packages/vue/src/renderers/filterRenderer.ts

import { defineComponent, type PropType } from "vue";
import type { ColumnDefinition, FilterRendererParams } from "@gp-grid/core";
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

export const CustomFilterContent = defineComponent({
  name: "GpGridCustomFilterContent",
  props: {
    renderer: { type: [Function, Object] as PropType<VueFilterRenderer>, required: true },
    params: { type: Object as PropType<FilterRendererParams>, required: true },
  },
  setup: (props) => () => invokeRenderer(props.renderer, props.params),
});
