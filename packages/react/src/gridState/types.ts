// packages/react/src/gridState/types.ts

import type { GridInstruction } from "gp-grid-core";

// Re-export types from core for backwards compatibility
export type {
  SlotData,
  HeaderData,
  FilterPopupState,
  GridState,
} from "gp-grid-core";

// =============================================================================
// Grid Actions (React-specific)
// =============================================================================

export type GridAction =
  | { type: "BATCH_INSTRUCTIONS"; instructions: GridInstruction[] }
  | { type: "RESET" };
