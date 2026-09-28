// packages/vue/src/gridState/useGridState.ts

import { shallowRef, type ShallowRef } from "vue";
import type { GridInstruction, GridState, InitialStateArgs } from "@gp-grid/core";
import { createInitialState, applyInstruction } from "@gp-grid/core";

export type { InitialStateArgs } from "@gp-grid/core";
export { createInitialState } from "@gp-grid/core";

/**
 * Instructions that cannot change what a mounted cell shows on their own. A
 * row's content change arrives as `ASSIGN_SLOT` with a new slot `generation`,
 * a column window change as new column props, and a hover change through the
 * injected hover position its classes read. Scroll batches re-emit the
 * unchanged column window, and a pointer over a scrolling grid hovers a new
 * row every frame.
 */
const LAYOUT_INSTRUCTIONS: ReadonlySet<GridInstruction["type"]> = new Set([
  "SET_HOVER_POSITION",
  "CREATE_SLOT",
  "DESTROY_SLOT",
  "ASSIGN_SLOT",
  "MOVE_SLOT",
  "UPDATE_VISIBLE_RANGE",
  "SET_CONTENT_SIZE",
  "SET_COLUMN_WINDOW",
  "SET_ROW_REGIONS",
  "SCROLL_TO",
]);

const changesCellContent = (instructions: readonly GridInstruction[]): boolean =>
  instructions.some((instruction) => LAYOUT_INSTRUCTIONS.has(instruction.type) === false);

// =============================================================================
// Composable
// =============================================================================

/**
 * Vue composable for managing grid state
 *
 * Uses shallowRef so that state replacement is atomic — a single assignment
 * to state.value triggers exactly one reactive notification.  Vue's own
 * scheduler batches multiple synchronous state.value replacements into a
 * single re-render, so no microtask buffering is needed.
 */
export function useGridState(args?: InitialStateArgs): {
  state: ShallowRef<GridState>;
  /** Bumped once per batch. */
  renderToken: ShallowRef<number>;
  /** Bumped by batches that can change core-backed cell content; cells read it. */
  contentToken: ShallowRef<number>;
  applyInstructions: (instructions: GridInstruction[]) => void;
  reset: () => void;
} {
  const state = shallowRef<GridState>(createInitialState(args));
  const renderToken = shallowRef(0);
  const contentToken = shallowRef(0);

  /**
   * Apply a batch of instructions atomically to the state.
   * Builds up changes on plain (non-reactive) objects, then swaps
   * state.value in a single assignment → one reactive trigger.
   *
   * Called once per emitBatch from the core.  Multiple emitBatch calls
   * within the same synchronous tick (e.g. during moveColumn) each
   * replace state.value, but Vue batches them into one render.
   */
  const applyInstructions = (instructions: GridInstruction[]): void => {
    const current = state.value;
    // Copy-on-write: a window-only batch mutates no map, so both keep their
    // identity and dependent computeds skip re-evaluating.
    let workingSlots = current.slots;
    let workingHeaders = current.headers;

    // Reset the pending scroll each batch — only set when SCROLL_TO is in this batch
    let mergedChanges: Partial<GridState> = {
      pendingScrollTop: null,
      pendingScrollLeft: null,
    };

    for (const instruction of instructions) {
      switch (instruction.type) {
        case "CREATE_SLOT":
        case "DESTROY_SLOT":
        case "ASSIGN_SLOT":
        case "MOVE_SLOT":
          if (workingSlots === current.slots) workingSlots = new Map(current.slots);
          break;
        case "UPDATE_HEADER":
        case "REMOVE_HEADERS":
          if (workingHeaders === current.headers) workingHeaders = new Map(current.headers);
          break;
        default:
          break;
      }
      const changes = applyInstruction(instruction, workingSlots, workingHeaders);
      if (changes) {
        Object.assign(mergedChanges, changes);
      }
    }

    mergedChanges.slots = workingSlots;
    mergedChanges.headers = workingHeaders;

    // Atomic replacement — exactly one reactive notification
    state.value = { ...current, ...mergedChanges };
    renderToken.value += 1;
    if (changesCellContent(instructions)) contentToken.value += 1;
  };

  /**
   * Reset state to initial values
   */
  const reset = (): void => {
    state.value = createInitialState();
    renderToken.value += 1;
    contentToken.value += 1;
  };

  return {
    state,
    renderToken,
    contentToken,
    applyInstructions,
    reset,
  };
}
