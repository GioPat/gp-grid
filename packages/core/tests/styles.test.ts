// packages/core/tests/styles.test.ts
// Guards the cell text-overflow styles so the ellipsis / wrapText feature
// cannot be silently regressed by a CSS refactor.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cellStyles = readFileSync(resolve(__dirname, "../src/styles/cells.css"), "utf8");
const filterStyles = readFileSync(resolve(__dirname, "../src/styles/filters.css"), "utf8");

describe("cells.css", () => {
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

  it("lets the peek overlay wrap the default content span instead of scrolling horizontally", () => {
    const peekContentRule = cellStyles.slice(
      cellStyles.indexOf(".gp-grid-cell-peek .gp-grid-cell-content {"),
    );
    expect(peekContentRule).toContain("white-space: inherit");
    expect(peekContentRule).toContain("text-overflow: clip");
  });
});

describe("filters.css", () => {
  it("centers the remove glyph horizontally and vertically", () => {
    const removeRule = filterStyles.slice(
      filterStyles.indexOf(".gp-grid-filter-remove {"),
      filterStyles.indexOf(":where(.gp-grid-filter-remove)"),
    );
    expect(removeRule).toContain("display: inline-flex");
    expect(removeRule).toContain("align-items: center");
    expect(removeRule).toContain("justify-content: center");
  });

  it("uses the theme primary color for filter-control focus outlines", () => {
    expect(filterStyles).toContain(
      ".gp-grid-filter-content button:focus-visible",
    );
    expect(filterStyles).toContain(
      ".gp-grid-filter-content select:focus-visible",
    );
    expect(filterStyles).toContain(
      ".gp-grid-filter-content input:focus-visible",
    );
    expect(filterStyles).toContain("outline: 2px solid var(--gp-grid-primary)");
  });

  it("keeps active filter toggles visible against generic button styles", () => {
    const modeToggleRule = filterStyles.slice(
      filterStyles.indexOf(".gp-grid-filter-mode-toggle button.active {"),
      filterStyles.indexOf("/* Info message for too many values */"),
    );
    const combinationToggleRule = filterStyles.slice(
      filterStyles.indexOf(".gp-grid-filter-combination button.active {"),
      filterStyles.indexOf(".gp-grid-filter-content button:focus-visible"),
    );

    expect(modeToggleRule).toContain(
      "background-color: var(--gp-grid-primary)",
    );
    expect(modeToggleRule).toContain("border-color: var(--gp-grid-primary)");
    expect(combinationToggleRule).toContain(
      "background-color: var(--gp-grid-primary)",
    );
    expect(combinationToggleRule).toContain(
      "border-color: var(--gp-grid-primary)",
    );
  });

  it("renders the mode selector without a padded dark track", () => {
    const modeToggleContainerRule = filterStyles.slice(
      filterStyles.indexOf(":where(.gp-grid-filter-mode-toggle) {"),
      filterStyles.indexOf(".gp-grid-filter-mode-toggle button {"),
    );
    const modeToggleFocusRule = filterStyles.slice(
      filterStyles.indexOf(
        ".gp-grid-filter-mode-toggle button:focus-visible {",
      ),
      filterStyles.indexOf("/* Add condition button */"),
    );

    expect(modeToggleContainerRule).not.toContain("background-color");
    expect(modeToggleContainerRule).not.toContain("padding");
    expect(modeToggleFocusRule).toContain("outline-offset: -2px");
  });
});
