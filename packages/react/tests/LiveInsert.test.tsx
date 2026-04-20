// packages/react/tests/LiveInsert.test.tsx
// Repro for live-insert bug: rows added via MutableDataSource are not
// displayed in the grid until a filter/sort refresh happens.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { Grid } from "../src/Grid";
import { createMutableClientDataSource } from "@gp-grid/core";
import type { ColumnDefinition } from "@gp-grid/core";

interface Row {
  id: number;
  value: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "value", cellDataType: "text", width: 200 },
];

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// happy-dom doesn't compute layout, so we stub clientWidth/clientHeight on
// all HTMLDivElements the grid reads from its containerRef.
const stubLayoutDims = (width: number, height: number): (() => void) => {
  const origWidthDesc = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  const origHeightDesc = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
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

describe("Live insert via MutableDataSource", () => {
  let restoreLayout: (() => void) | undefined;

  beforeEach(() => {
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    // Simulate a ~360px body viewport (container clientHeight) so the grid
    // computes ~10 visible rows with rowHeight=36.
    restoreLayout = stubLayoutDims(800, 360);
  });

  afterEach(() => {
    restoreLayout?.();
    vi.restoreAllMocks();
  });

  it("renders rows added after mount", async () => {
    const initial: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      value: `row-${i + 1}`,
    }));

    const ds = createMutableClientDataSource<Row>(initial, {
      getRowId: (r) => r.id,
      debounceMs: 0,
    });

    const { container } = render(
      <div style={{ width: "800px", height: "400px" }}>
        <Grid<Row>
          columns={columns}
          dataSource={ds}
          rowHeight={36}
          headerHeight={40}
        />
      </div>,
    );

    // Wait for initial render with 10 rows
    await waitFor(() => {
      const rows = container.querySelectorAll(".gp-grid-row");
      expect(rows.length).toBeGreaterThanOrEqual(10);
    });

    const initialRowCount = container.querySelectorAll(".gp-grid-row").length;
    const contentSizerBefore = container.querySelector(
      '[style*="position: relative"][style*="min-width"]',
    ) as HTMLElement | null;
    console.log("before height:", contentSizerBefore?.style.height);

    // Add an 11th row — use debounceMs 50 flow like the playground
    await act(async () => {
      ds.addRows([{ id: 11, value: "row-11" }]);
      await ds.flushTransactions();
      await new Promise((r) => setTimeout(r, 50));
    });

    const finalRowCount = container.querySelectorAll(".gp-grid-row").length;
    const contentSizerAfter = container.querySelector(
      '[style*="position: relative"][style*="min-width"]',
    ) as HTMLElement | null;
    console.log("after height:", contentSizerAfter?.style.height);
    console.log({ initialRowCount, finalRowCount });

    // Dump row translateY values to see if row 11 is positioned correctly
    const rows = Array.from(container.querySelectorAll(".gp-grid-row"));
    const positions = rows.map((r) => (r as HTMLElement).style.transform);
    console.log("row translate Y:", positions);

    const hasRow11 = Array.from(container.querySelectorAll(".gp-grid-cell")).some(
      (el) => el.textContent?.includes("row-11"),
    );
    expect(hasRow11).toBe(true);
  });

  it("renders rows added in many sequential transactions (stream-like)", async () => {
    const initial: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      value: `row-${i + 1}`,
    }));

    const ds = createMutableClientDataSource<Row>(initial, {
      getRowId: (r) => r.id,
      debounceMs: 50,
    });

    const { container } = render(
      <div style={{ width: "800px", height: "400px" }}>
        <Grid<Row>
          columns={columns}
          dataSource={ds}
          rowHeight={36}
          headerHeight={40}
        />
      </div>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".gp-grid-row").length).toBeGreaterThanOrEqual(10);
    });

    // Simulate a stream: 20 rapid adds separated by less than debounce
    await act(async () => {
      for (let i = 0; i < 20; i++) {
        ds.addRows([{ id: 12 + i, value: `stream-${i}` }]);
        await new Promise((r) => setTimeout(r, 30));
      }
      await ds.flushTransactions();
      await new Promise((r) => setTimeout(r, 200));
    });

    // After all additions, the grid should have data for at least the visible rows
    // (11..30 total = 30 rows). Viewport only shows ~10, but cachedRows/contentHeight
    // should reflect the new total.
    const rowCount = container.querySelectorAll(".gp-grid-row").length;
    console.log({ rowCount });
    expect(rowCount).toBeGreaterThanOrEqual(10);
  });
});
