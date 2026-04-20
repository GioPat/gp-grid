import type { PointerEventData } from "../types/input";

/**
 * Convert a DOM PointerEvent into the framework-agnostic PointerEventData
 * shape consumed by core.input.*.
 *
 * Used by framework wrappers so each pointer-down handler doesn't have to
 * spell out the 8-field literal.
 */
export const toPointerEventData = (event: PointerEvent): PointerEventData => ({
  clientX: event.clientX,
  clientY: event.clientY,
  button: event.button,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  pointerId: event.pointerId,
  pointerType: event.pointerType,
});
