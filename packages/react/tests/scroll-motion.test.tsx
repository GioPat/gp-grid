// packages/react/tests/scroll-motion.test.tsx

import { describe, it, expect } from "vitest";
import type { MutableRefObject } from "react";
import { render, act, waitFor, fireEvent } from "@testing-library/react";
import { createClientDataSource } from "@gp-grid/core";
import type { ColumnDefinition } from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridRef } from "../src/types";

interface Row {
  id: number;
}

// Past MAX_SCROLL_HEIGHT at 36 px rows, so scroll scaling and synthetic flings apply.
const ROW_COUNT = 300_000;
const rows: Row[] = Array.from({ length: ROW_COUNT }, (_, id) => ({ id }));
const columns: ColumnDefinition[] = [{ colId: "id", field: "id", cellDataType: "number", width: 80 }];

const touch = (el: Element, type: string, clientY: number, timeStamp: number): void => {
  const touches = [{ identifier: 0, clientX: 10, clientY }];
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    touches,
    changedTouches: touches,
  });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  el.dispatchEvent(event);
};

describe("scroll motion", () => {
  it("a mouse press during a fling stops it and selects nothing", async () => {
    const gridRef: MutableRefObject<GridRef<Row> | null> = { current: null };
    render(
      <Grid
        columns={columns}
        dataSource={createClientDataSource(rows)}
        rowHeight={36}
        getRowId={(row) => row.id}
        gridRef={gridRef}
      />,
    );
    await waitFor(() => {
      expect(document.querySelectorAll(".gp-grid-cell").length).toBeGreaterThan(0);
    });
    const core = gridRef.current!.core;
    expect(core.viewport.isScaling()).toBe(true);
    const scrollEl = document.querySelector(".gp-grid-body-scroll")!;
    Object.defineProperty(scrollEl, "scrollHeight", { configurable: true, value: 10_000_000 });

    touch(scrollEl, "touchstart", 400, 0);
    touch(scrollEl, "touchmove", 300, 16);
    touch(scrollEl, "touchmove", 200, 32);
    touch(scrollEl, "touchend", 200, 40);
    expect(core.viewport.isScrollMotionActive()).toBe(true);

    const cell = document.querySelector(".gp-grid-cell")!;
    await act(async () => {
      fireEvent.pointerDown(cell, { button: 0, pointerType: "mouse" });
    });
    expect(core.viewport.isScrollMotionActive()).toBe(false);
    expect(core.selection.getActiveCell()).toBeNull();
    expect(core.input.getDragState().isDragging).toBe(false);

    await act(async () => {
      fireEvent.pointerDown(cell, { button: 0, pointerType: "mouse" });
      fireEvent.pointerUp(document, { button: 0, pointerType: "mouse" });
    });
    expect(core.selection.getActiveCell()).not.toBeNull();
  });
});
