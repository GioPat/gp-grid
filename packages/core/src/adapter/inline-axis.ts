// packages/core/src/adapter/inline-axis.ts

import type { ContainerBounds } from "../types/input";

/**
 * Inline-axis (RTL) normalization. Core geometry is direction-agnostic:
 * every x it produces or consumes is an offset from the inline-start edge.
 * These helpers are the only place a physical x — a DOM `scrollLeft`, a
 * `clientX`, a CSS `left` — becomes inline-relative, and back.
 */

/** Direction of an element's own computed style; LTR without a DOM (SSR). */
export const readIsRtl = (el: Element | null | undefined): boolean => {
  if (el === null || el === undefined) return false;
  return el.ownerDocument.defaultView?.getComputedStyle(el).direction === "rtl";
};

/** Physical x → inline-start-relative x. The flip is its own inverse. */
export const toInlineX = (physicalX: number, rtl: boolean): number =>
  // `0 - x` rather than `-x`: a flipped zero must stay positive.
  rtl ? 0 - physicalX : physicalX;

/** Inline-start-relative x → physical x. */
export const toPhysicalX = (inlineX: number, rtl: boolean): number =>
  rtl ? 0 - inlineX : inlineX;

/**
 * Inline-start-relative x of a `clientX`. `bounds` describes the client box
 * (`left`/`width` exclude the border, and in RTL the left-hand scrollbar),
 * so the inline-start edge is `left + width` in RTL and `left` in LTR.
 */
export const inlineOffset = (bounds: ContainerBounds, clientX: number): number =>
  bounds.rtl === true ? bounds.left + bounds.width - clientX : clientX - bounds.left;

/**
 * Swap the horizontal arrows in RTL so a key moves focus toward the side it
 * points at; core selection stays direction-agnostic. Vertical arrows, Tab and
 * every other key keep their logical meaning.
 */
export const normalizeHorizontalKey = (key: string, rtl: boolean): string => {
  if (rtl === false) return key;
  if (key === "ArrowLeft") return "ArrowRight";
  if (key === "ArrowRight") return "ArrowLeft";
  return key;
};

/** Client-box bounds of a scroll container, with inline-relative scroll. */
export const readContainerBounds = (el: HTMLElement): ContainerBounds => {
  const rect = el.getBoundingClientRect();
  const rtl = readIsRtl(el);
  return {
    top: rect.top + el.clientTop,
    left: rect.left + el.clientLeft,
    width: el.clientWidth,
    height: el.clientHeight,
    scrollTop: el.scrollTop,
    scrollLeft: toInlineX(el.scrollLeft, rtl),
    rtl,
  };
};

/**
 * CSS `left` for a fixed-position overlay anchored at inline-start offset
 * `inlineX` inside a scroll container's client box. Fixed overlays escape the
 * scroller, so they need the physical edge the inline start maps to.
 */
export const fixedLeftForInline = (el: HTMLElement, inlineX: number, width: number): number => {
  const rect = el.getBoundingClientRect();
  const clientStart = rect.left + el.clientLeft;
  if (readIsRtl(el) === false) return clientStart + inlineX;
  return clientStart + el.clientWidth - inlineX - width;
};
