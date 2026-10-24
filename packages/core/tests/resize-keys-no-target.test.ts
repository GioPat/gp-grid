// packages/core/tests/resize-keys-no-target.test.ts
// PRD 007 D4: grid keys that resolve to no resize, move or fit target, so the
// key is left to the browser.

import { describe, expect, it } from "vitest";
import { resolveGridResizeKey } from "../src/input";
import { alt, createGrid } from "./resize-keys-harness";

describe("resolveGridResizeKey without a target", () => {
  it.each([
    { name: "Alt+Home", event: alt("Home"), cell: { row: 0, col: 1 } },
    { name: "Alt+ArrowDown past the last row", event: alt("ArrowDown"), cell: { row: 50, col: 1 } },
    { name: "Alt+Shift+Enter past the last row", event: alt("Enter", true), cell: { row: 50, col: 1 } },
    { name: "Alt+Shift+ArrowLeft on the first column", event: alt("ArrowLeft", true), cell: { row: 0, col: 0 } },
    { name: "Alt+Shift+ArrowRight on a hidden column", event: alt("ArrowRight", true), cell: { row: 0, col: 3 } },
  ])("resolves $name to null", async ({ event, cell }) => {
    const { grid } = await createGrid();

    expect(resolveGridResizeKey(grid, event, cell, 320)).toBeNull();
  });
});
