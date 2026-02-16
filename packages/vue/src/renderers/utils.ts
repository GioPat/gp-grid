// packages/vue/src/renderers/utils.ts

import { createTextVNode, type VNode } from "vue";

/**
 * Ensure we always return a VNode, never a plain string
 */
export const toVNode = (value: VNode | string | null | undefined): VNode => {
  if (value == null || value === "") {
    return createTextVNode("");
  }
  if (typeof value === "string") {
    return createTextVNode(value);
  }
  return value;
};
