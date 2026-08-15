// packages/core/tests/styles.test.ts
// Guards the cell text-overflow styles so the ellipsis / wrapText feature
// cannot be silently regressed by a CSS refactor.

import { describe, it, expect } from "vitest";
import { cellStyles } from "../src/styles/cells";

describe("cellStyles", () => {
  it("defines a content wrapper that applies a single-line ellipsis", () => {
    expect(cellStyles).toContain(".gp-grid-cell-content");
    expect(cellStyles).toContain("text-overflow: ellipsis");
  });

  it("defines a wrap modifier that switches to multi-line wrapping", () => {
    expect(cellStyles).toContain(".gp-grid-cell--wrap");
    expect(cellStyles).toContain("overflow-wrap: anywhere");
  });

  it("keeps the flex cell itself from ellipsizing (text-overflow is on the wrapper)", () => {
    const cellRule = cellStyles.slice(
      cellStyles.indexOf(".gp-grid-cell {"),
      cellStyles.indexOf(".gp-grid-cell-content"),
    );
    expect(cellRule).toContain("overflow: hidden");
    expect(cellRule).not.toContain("text-overflow: ellipsis");
  });
});
