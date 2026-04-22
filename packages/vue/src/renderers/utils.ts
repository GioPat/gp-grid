// packages/vue/src/renderers/utils.ts

import { createTextVNode, h, type Component, type VNode } from "vue";

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

/**
 * Invoke a renderer that may be either a render function or a Vue component.
 * Functions are called with params; components are instantiated with params as props.
 */
export const invokeRenderer = <P extends object, R extends VNode | string | null>(
  renderer: ((params: P) => R) | Component,
  params: P,
): VNode => {
  // A Vue Component can itself be a function (FunctionalComponent) or a class ctor,
  // so `typeof === "function"` alone isn't enough to distinguish a render fn from a
  // component. Since SFCs and defineComponent() output are objects, we treat every
  // function renderer as a plain render fn — users wrapping a FunctionalComponent
  // should do so via `(params) => h(FnComp, params)`.
  if (typeof renderer === "function") {
    return toVNode((renderer as (p: P) => R)(params));
  }
  return h(renderer, params);
};
