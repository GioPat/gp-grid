// packages/react/tests/wrapText.test.tsx
// Verifies the long-text handling: default cells wrap their text in
// `.gp-grid-cell-content` (enabling the ellipsis) and `wrapText` toggles the
// multi-line `.gp-grid-cell--wrap` modifier.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Grid, type GridProps } from "../src/Grid";
import type { ColumnDefinition } from "@gp-grid/core";

interface TestRow {
  id: number;
  name: string;
}

const sampleData: TestRow[] = [
  { id: 1, name: "A very long name that should overflow the column width" },
  { id: 2, name: "Bob" },
];

function createDefaultProps(
  overrides?: Partial<GridProps<TestRow>>,
): GridProps<TestRow> {
  return {
    columns: [],
    rowData: sampleData,
    rowHeight: 32,
    ...overrides,
  };
}

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("wrapText", () => {
  beforeEach(() => {
    global.ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps default cell text in .gp-grid-cell-content", async () => {
    const columns: ColumnDefinition[] = [
      { field: "name", cellDataType: "text", width: 60 },
    ];
    render(<Grid {...createDefaultProps({ columns })} />);

    await waitFor(() => {
      expect(
        document.querySelectorAll(".gp-grid-cell-content").length,
      ).toBeGreaterThan(0);
    });
  });

  it("adds gp-grid-cell--wrap when wrapText is true", async () => {
    const columns: ColumnDefinition[] = [
      { field: "id", cellDataType: "number", width: 60 },
      { field: "name", cellDataType: "text", width: 60, wrapText: true },
    ];
    render(<Grid {...createDefaultProps({ columns })} />);

    await waitFor(() => {
      expect(document.querySelectorAll(".gp-grid-cell").length).toBeGreaterThan(0);
    });

    const firstRow = document.querySelector(".gp-grid-row");
    const rowCells = firstRow?.querySelectorAll(".gp-grid-cell");
    expect(rowCells?.[1]?.className).toContain("gp-grid-cell--wrap");
  });

  it("does not add gp-grid-cell--wrap by default", async () => {
    const columns: ColumnDefinition[] = [
      { field: "name", cellDataType: "text", width: 60 },
    ];
    render(<Grid {...createDefaultProps({ columns })} />);

    await waitFor(() => {
      expect(document.querySelectorAll(".gp-grid-cell").length).toBeGreaterThan(0);
    });

    const cell = document.querySelector(".gp-grid-cell");
    expect(cell?.className).not.toContain("gp-grid-cell--wrap");
  });
});
