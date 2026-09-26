// packages/react/tests/write-rejection.test.tsx

import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { Grid } from "../src/Grid";
import { createColumnarDataSource } from "@gp-grid/core";
import type { CellWriteRejectedEvent, ColumnDefinition } from "@gp-grid/core";
import type { GridRef } from "../src/types";

interface TestRow {
  name: string;
}

const columns: ColumnDefinition[] = [
  { field: "name", cellDataType: "text", width: 160, editable: true },
];

class MockResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("Grid write rejection", () => {
  beforeEach(() => {
    global.ResizeObserver = MockResizeObserver;
  });

  it("delivers onWriteRejected attached after mount", async () => {
    const source = createColumnarDataSource({
      rowCount: 1,
      fields: [{ field: "name", data: ["Ada"] }],
    });
    const rejected: CellWriteRejectedEvent[] = [];
    const onWriteRejected = (event: CellWriteRejectedEvent): void => {
      rejected.push(event);
    };

    const gridRef: { current: GridRef<TestRow> | null } = { current: null };
    const baseProps = {
      columns,
      dataSource: source,
      rowHeight: 32,
      initialWidth: 400,
      initialHeight: 200,
    };

    const { rerender } = render(<Grid<TestRow> {...baseProps} gridRef={gridRef} />);
    await waitFor(() => expect(gridRef.current?.core).toBeTruthy());

    // Attach the handler only after the core already exists. The core is not
    // recreated here because none of its creation dependencies changed.
    rerender(
      <Grid<TestRow> {...baseProps} gridRef={gridRef} onWriteRejected={onWriteRejected} />,
    );
    await waitFor(() => expect(gridRef.current?.core).toBeTruthy());

    act(() => {
      gridRef.current?.core?.cells.setValue(0, 0, "Grace");
    });

    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      row: 0,
      col: 0,
      field: "name",
      reason: "read-only-source",
      operation: "setCellValue",
    });
    await waitFor(() => {
      const cell = document.querySelector('[data-cell-row="0"][data-cell-col="0"]');
      expect(cell?.textContent).toContain("Ada");
    });
  });
});
