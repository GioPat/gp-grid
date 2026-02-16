// packages/react/src/gridState/reducer.ts

import type { Row } from "@gp-grid/core";
import { createInitialState, applyInstruction } from "@gp-grid/core";
import type { GridState, GridAction } from "./types";

export type { InitialStateArgs } from "@gp-grid/core";
export { createInitialState } from "@gp-grid/core";

// =============================================================================
// Reducer
// =============================================================================

export function gridReducer<TData = Row>(state: GridState<TData>, action: GridAction): GridState<TData> {
  if (action.type === "RESET") {
    return createInitialState<TData>();
  }

  // Process batch of instructions in one state update
  const { instructions } = action;
  if (instructions.length === 0) {
    return state;
  }

  // Create mutable copies of Maps to batch updates
  const newSlots = new Map(state.slots);
  const newHeaders = new Map(state.headers);
  let stateChanges: Partial<GridState<TData>> = {};

  // Apply all instructions
  for (const instruction of instructions) {
    const changes = applyInstruction<TData>(instruction, newSlots, newHeaders);
    if (changes) {
      stateChanges = { ...stateChanges, ...changes };
    }
  }

  // Return new state with all changes applied
  return {
    ...state,
    ...stateChanges,
    slots: newSlots,
    headers: newHeaders,
  };
}
