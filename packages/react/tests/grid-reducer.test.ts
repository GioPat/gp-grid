import { describe, expect, it } from "vitest";
import { createInitialState, gridReducer } from "../src/gridState";
import type { GridInstruction } from "@gp-grid/core";

const reduce = (state: ReturnType<typeof createInitialState>, instructions: GridInstruction[]) =>
  gridReducer(state, { type: "BATCH_INSTRUCTIONS", instructions });

describe("gridReducer pending scroll", () => {
  it("keeps the vertical axis null for a horizontal-only SCROLL_TO", () => {
    const state = reduce(createInitialState({}), [{ type: "SCROLL_TO", scrollLeft: 120 }]);
    expect(state.pendingScrollTop).toBeNull();
    expect(state.pendingScrollLeft).toBe(120);
  });

  it("clears both axes on the next batch", () => {
    const corrected = reduce(createInitialState({}), [
      { type: "SCROLL_TO", scrollTop: 0, scrollLeft: 120 },
    ]);
    const next = reduce(corrected, [{ type: "SET_ACTIVE_CELL", position: null }]);
    expect(next.pendingScrollTop).toBeNull();
    expect(next.pendingScrollLeft).toBeNull();
  });
});
