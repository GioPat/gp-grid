// packages/vue/src/renderers/groupLabelRenderer.ts

import { createTextVNode, type VNode } from "vue";
import type { GroupLabelRendererParams } from "@gp-grid/core";
import type { VueGroupLabelRenderer } from "../types";
import { invokeRenderer } from "./utils";

/** The `groupLabelRenderer` output, or the formatted label. */
export const renderGroupLabel = (
  params: GroupLabelRendererParams,
  renderer?: VueGroupLabelRenderer,
): VNode =>
  renderer === undefined ? createTextVNode(params.label) : invokeRenderer(renderer, params);
