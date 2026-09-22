// packages/react/tests/GridGeometry.test.tsx
// Geometry wrapper contract: the React grid renders the core-resolved
// displayed-column layout and never recomputes widths locally.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { Grid, type GridProps, type GridRef } from "../src/Grid";
import type { ColumnDefinition } from "@gp-grid/core";

interface Row {
  id: number;
  name: string;
}

const sampleData: Row[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
];

const baseColumns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 100 },
  { field: "name", cellDataType: "text", width: 100 },
];

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const stubLayoutDims = (width: number, height: number): (() => void) => {
  const origWidthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const origHeightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return width;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return height;
    },
  });
  return () => {
    if (origWidthDesc) Object.defineProperty(HTMLElement.prototype, "clientWidth", origWidthDesc);
    if (origHeightDesc) Object.defineProperty(HTMLElement.prototype, "clientHeight", origHeightDesc);
  };
};

interface HeaderBox {
  left: number;
  width: number;
}

// `left` is the inline-start offset: the wrappers position columns logically.
const headerBoxes = (): HeaderBox[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".gp-grid-header-cell")).map((cell) => ({
    left: Number.parseFloat(cell.style.insetInlineStart || cell.style.left),
    width: Number.parseFloat(cell.style.width),
  }));

const cellBoxes = (): HeaderBox[] => {
  const cells = Array.from(
    document.querySelectorAll<HTMLElement>('[data-cell-row="0"][data-cell-col]'),
  ).sort(
    (a, b) =>
      Number(a.getAttribute("data-cell-col")) - Number(b.getAttribute("data-cell-col")),
  );
  return cells.map((cell) => ({
    left: Number.parseFloat(cell.style.insetInlineStart || cell.style.left),
    width: Number.parseFloat(cell.style.width),
  }));
};

const createProps = (overrides?: Partial<GridProps<Row>>): GridProps<Row> => ({
  columns: baseColumns,
  rowData: sampleData,
  rowHeight: 32,
  ...overrides,
});

describe("React wrapper renders the core-resolved layout", () => {
  let restoreLayout: (() => void) | null = null;

  beforeEach(() => {
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    restoreLayout = stubLayoutDims(400, 320);
  });

  afterEach(() => {
    restoreLayout?.();
    vi.restoreAllMocks();
  });

  it("fills the viewport in fit mode", async () => {
    render(<Grid {...createProps()} />);

    await waitFor(() => {
      expect(headerBoxes()).toHaveLength(2);
    });
    const headers = headerBoxes();
    expect(headers[0]).toEqual({ left: 0, width: 200 });
    expect(headers[1]).toEqual({ left: 200, width: 200 });

    await waitFor(() => {
      expect(cellBoxes()).toHaveLength(2);
    });
    expect(cellBoxes()).toEqual(headers);
  });

  it("keeps declared widths in fixed mode", async () => {
    render(<Grid {...createProps({ columnLayout: "fixed" })} />);

    await waitFor(() => {
      expect(headerBoxes()).toHaveLength(2);
    });
    expect(headerBoxes()).toEqual([
      { left: 0, width: 100 },
      { left: 100, width: 100 },
    ]);
  });

  it("switches mode at runtime without recreating the core", async () => {
    const ref: GridRef<Row> = { core: null };
    const gridRef = { current: ref };
    const { rerender } = render(<Grid {...createProps({ gridRef })} />);

    await waitFor(() => {
      expect(headerBoxes()).toHaveLength(2);
    });
    const core = ref.core;
    expect(core).not.toBeNull();
    expect(headerBoxes()[0]?.width).toBe(200);

    await act(async () => {
      rerender(<Grid {...createProps({ gridRef, columnLayout: "fixed" })} />);
    });

    await waitFor(() => {
      expect(headerBoxes()[0]?.width).toBe(100);
    });
    expect(ref.core).toBe(core);
  });

  it("re-renders header content when a same-size definition is replaced", async () => {
    const { rerender } = render(<Grid {...createProps()} />);

    await waitFor(() => {
      expect(document.querySelector(".gp-grid-header-cell")?.textContent).toContain("id");
    });

    const replaced: ColumnDefinition[] = [
      { field: "id", cellDataType: "number", width: 100, headerName: "Identifier" },
      { field: "name", cellDataType: "text", width: 100 },
    ];
    await act(async () => {
      rerender(<Grid {...createProps({ columns: replaced })} />);
    });

    await waitFor(() => {
      expect(document.querySelector(".gp-grid-header-cell")?.textContent).toContain(
        "Identifier",
      );
    });
    // Widths are unchanged, so the rendered geometry must not move.
    expect(headerBoxes()[0]?.width).toBe(200);
  });
});
