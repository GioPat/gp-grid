import { describe, expect, it, vi } from "vitest";
import { RowDrag } from "../src/input";
import type { GridCore } from "../src/grid-core";
import type { ContainerBounds, InputHandlerDeps, PointerEventData } from "../src/types";

const createPointerEvent = (clientY: number): PointerEventData => ({
  clientX: 0,
  clientY,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
});

const bounds: ContainerBounds = {
  top: 0,
  left: 0,
  width: 400,
  height: 200,
  scrollTop: 0,
  scrollLeft: 0,
};

describe("RowDrag", () => {
  it("converts a downward hovered row into an insertion index", () => {
    const commitRowDrag = vi.fn();
    const core = {
      getRowCount: () => 5,
      getRowIndexAtDisplayY: (y: number) => Math.floor(y / 20),
      getRowTranslateY: (rowIndex: number) => rowIndex * 20,
      commitRowDrag,
    } as unknown as GridCore;
    const deps: InputHandlerDeps = {
      getHeaderHeight: () => 20,
      getRowHeight: () => 20,
      getColumnPositions: () => [0],
      getColumnCount: () => 1,
    };

    const rowDrag = new RowDrag(core, deps);
    rowDrag.start(1, 0, 25);
    rowDrag.move(createPointerEvent(45), bounds);
    rowDrag.end();

    expect(commitRowDrag).toHaveBeenCalledWith(1, 3);
  });

  it("converts an upward hovered row into an insertion index", () => {
    const commitRowDrag = vi.fn();
    const core = {
      getRowCount: () => 5,
      getRowIndexAtDisplayY: (y: number) => Math.floor(y / 20),
      getRowTranslateY: (rowIndex: number) => rowIndex * 20,
      commitRowDrag,
    } as unknown as GridCore;
    const deps: InputHandlerDeps = {
      getHeaderHeight: () => 20,
      getRowHeight: () => 20,
      getColumnPositions: () => [0],
      getColumnCount: () => 1,
    };

    const rowDrag = new RowDrag(core, deps);
    rowDrag.start(3, 0, 65);
    rowDrag.move(createPointerEvent(45), bounds);
    rowDrag.end();

    expect(commitRowDrag).toHaveBeenCalledWith(3, 2);
  });
});
