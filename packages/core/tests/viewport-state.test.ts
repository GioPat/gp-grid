// packages/core/tests/viewport-state.test.ts
// The body height a header band change derives (D8) against the pre-mount
// estimate.

import { describe, expect, it } from "vitest";
import { ViewportState } from "../src/managers/viewport-state";
import { UNMEASURED_VIEWPORT_HEIGHT } from "../src/geometry/row-regions";

describe("ViewportState.setViewportHeight", () => {
  it("keeps the estimate before the first measurement", () => {
    const state = new ViewportState();

    state.setViewportHeight(200);

    expect(state.isMeasured()).toBe(false);
    expect(state.getViewportHeight()).toBe(UNMEASURED_VIEWPORT_HEIGHT);
  });

  it("applies the derived height after a measurement until the next one", () => {
    const state = new ViewportState();
    state.update(0, 0, 400, 320);

    state.setViewportHeight(200);
    expect(state.getViewportHeight()).toBe(200);

    expect(state.update(0, 0, 400, 320)).toEqual({ changed: true, viewportSizeChanged: true });
    expect(state.getViewportHeight()).toBe(320);
  });
});
