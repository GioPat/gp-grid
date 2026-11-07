// packages/core/src/adapter/fixed-origin.ts

export interface FixedOrigin {
  top: number;
  left: number;
}

/**
 * Viewport position of the box `position: fixed` resolves against inside `host`.
 * Not the viewport when an ancestor has a transform, filter or `contain`
 * (e.g. dashboard panels), so fixed overlays must subtract it.
 */
export const readFixedOrigin = (host: HTMLElement): FixedOrigin => {
  const probe = host.ownerDocument.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none";
  host.appendChild(probe);
  const { top, left } = probe.getBoundingClientRect();
  probe.remove();
  return { top, left };
};
