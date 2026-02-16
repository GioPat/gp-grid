// packages/vue/src/gridState/useGridState.ts

import { reactive } from "vue";
import type { GridInstruction, GridState } from "@gp-grid/core";
import { createInitialState, applyInstruction } from "@gp-grid/core";

export type { InitialStateArgs } from "@gp-grid/core";
export { createInitialState } from "@gp-grid/core";

// =============================================================================
// Composable
// =============================================================================

/**
 * Vue composable for managing grid state
 */
export function useGridState(args?: { initialWidth?: number; initialHeight?: number }) {
  const state = reactive<GridState>(createInitialState(args));

  /**
   * Apply a batch of instructions to the state
   */
  function applyInstructions(instructions: GridInstruction[]): void {
    for (const instruction of instructions) {
      const changes = applyInstruction(instruction, state.slots, state.headers);
      if (changes) {
        Object.assign(state, changes);
      }
    }
  }

  /**
   * Reset state to initial values
   */
  function reset(): void {
    const initial = createInitialState();
    Object.assign(state, initial);
  }

  return {
    state,
    applyInstructions,
    reset,
  };
}
