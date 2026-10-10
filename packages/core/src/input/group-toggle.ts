// packages/core/src/input/group-toggle.ts

import type { GridCore } from "../grid-core";

/** A pointer down on a group row's expander, as the DOM delivers it. */
export type GroupTogglePointerEvent = Pick<PointerEvent, "button" | "pointerType" | "stopPropagation">;

/** The expander toggles its group; the cell beneath sees no pointer down. */
export const groupTogglePointerDown = <TData>(
  core: GridCore<TData> | null,
  rowIndex: number,
  event: GroupTogglePointerEvent,
): void => {
  event.stopPropagation();
  if (event.button !== 0) return;
  core?.input.handleGroupToggle(rowIndex, event.pointerType);
};
