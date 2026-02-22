// packages/vue/src/gridState/useGridState.ts

import { shallowRef, type ShallowRef } from "vue";
import type { GridInstruction, GridState } from "@gp-grid/core";
import { createInitialState, applyInstruction } from "@gp-grid/core";

export type { InitialStateArgs } from "@gp-grid/core";
export { createInitialState } from "@gp-grid/core";

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
export function useGridState(args?: { initialWidth?: number; initialHeight?: number }): {
  state: ShallowRef<GridState>;
  applyInstructions: (instructions: GridInstruction[]) => void;
  reset: () => void;
} {
  const state = shallowRef<GridState>(createInitialState(args));

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
    const workingSlots = new Map(current.slots);
    const workingHeaders = new Map(current.headers);

    let mergedChanges: Partial<GridState> = {};

    for (const instruction of instructions) {
      const changes = applyInstruction(instruction, workingSlots, workingHeaders);
      if (changes) {
        Object.assign(mergedChanges, changes);
      }
    }

    mergedChanges.slots = workingSlots;
    mergedChanges.headers = workingHeaders;

    // Atomic replacement — exactly one reactive notification
    state.value = { ...current, ...mergedChanges };
  };

  /**
   * Reset state to initial values
   */
  const reset = (): void => {
    state.value = createInitialState();
  };

  return {
    state,
    applyInstructions,
    reset,
  };
}
