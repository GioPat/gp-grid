// packages/core/tests/grid-styles.test.ts

import { describe, it, expect } from "vitest";
import { gridStyles } from "../src";
import { bundleStyles } from "../scripts/build-styles";

describe("gridStyles", () => {
  it("is the minified bundle of the stylesheet", () => {
    expect(gridStyles).toBe(bundleStyles(true));
    expect(gridStyles).toContain(".gp-grid-container{");
  });
});
