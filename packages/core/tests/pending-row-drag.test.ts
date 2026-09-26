import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource, createServerDataSource } from "../src/data-source";
import { PendingRowDragController } from "../src/adapter/pending-row-drag";
import type { ColumnDefinition, DragState } from "../src/types";
import type { ContainerBounds, PointerEventData, RowDragState } from "../src/types/input";

const dragState: DragState = {
  isDragging: true,
  dragType: "row-drag",
  fillSourceRange: null,
  fillTarget: null,
  columnResize: null,
  columnMove: null,
  rowDrag: {
    sourceRowIndex: 1,
    currentX: 10,
    currentY: 20,
    dropTargetIndex: null,
    dropIndicatorRegion: "suffix",
    dropIndicatorY: 0,
  },
};

const createCore = (
  confirmPendingRowDrag = vi.fn(() => true),
): GridCore<unknown> => {
  const core = {
    input: {
      cancelPendingRowDrag: vi.fn(),
      confirmPendingRowDrag,
      getDragState: vi.fn(() => dragState),
    },
  };
  return core as unknown as GridCore<unknown>;
};

const startFromElement = (
  controller: PendingRowDragController,
  target: HTMLElement,
  eventInit: PointerEventInit = {},
): void => {
  target.addEventListener(
    "pointerdown",
    (event) => controller.start(event),
    { once: true },
  );
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX: 10,
      clientY: 20,
      pointerId: 5,
      ...eventInit,
    }),
  );
};

describe("PendingRowDragController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("confirms pending row drag after the hold delay", () => {
    const container = document.createElement("div");
    container.style.overflow = "auto";
    const target = document.createElement("div");
    const setPointerCapture = vi.fn<(pointerId: number) => void>();
    Object.defineProperty(target, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    const onDragConfirmed = vi.fn();
    const core = createCore();
    const controller = new PendingRowDragController({
      getCore: () => core,
      getContainer: () => container,
      isBrowser: true,
      onDragConfirmed,
    });

    startFromElement(controller, target);
    vi.advanceTimersByTime(300);

    expect(core.input.confirmPendingRowDrag).toHaveBeenCalled();
    expect(container.style.overflow).toBe("hidden");
    expect(setPointerCapture).toHaveBeenCalledWith(5);
    expect(onDragConfirmed).toHaveBeenCalledWith(dragState);

    controller.releaseLocks();

    expect(container.style.overflow).toBe("auto");
  });

  it("confirms pending row drag when pointer capture fails", () => {
    const container = document.createElement("div");
    const target = document.createElement("div");
    const setPointerCapture = vi.fn<(pointerId: number) => void>(() => {
      throw new Error("Pointer released");
    });
    Object.defineProperty(target, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    const onDragConfirmed = vi.fn();
    const core = createCore();
    const controller = new PendingRowDragController({
      getCore: () => core,
      getContainer: () => container,
      isBrowser: true,
      onDragConfirmed,
    });

    startFromElement(controller, target);
    vi.advanceTimersByTime(300);

    expect(core.input.confirmPendingRowDrag).toHaveBeenCalled();
    expect(setPointerCapture).toHaveBeenCalledWith(5);
    expect(onDragConfirmed).toHaveBeenCalledWith(dragState);
  });

  it("cancels pending row drag when pointer movement exceeds the threshold", () => {
    const core = createCore();
    const controller = new PendingRowDragController({
      getCore: () => core,
      getContainer: () => document.createElement("div"),
      isBrowser: true,
      onDragConfirmed: vi.fn(),
    });

    startFromElement(controller, document.createElement("div"));
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 25,
        clientY: 20,
      }),
    );
    vi.advanceTimersByTime(300);

    expect(core.input.cancelPendingRowDrag).toHaveBeenCalled();
    expect(core.input.confirmPendingRowDrag).not.toHaveBeenCalled();
  });

  it("cancels pending row drag when pointer is released before the hold delay", () => {
    const core = createCore();
    const controller = new PendingRowDragController({
      getCore: () => core,
      getContainer: () => document.createElement("div"),
      isBrowser: true,
      onDragConfirmed: vi.fn(),
    });

    startFromElement(controller, document.createElement("div"));
    document.dispatchEvent(new PointerEvent("pointerup"));
    vi.advanceTimersByTime(300);

    expect(core.input.cancelPendingRowDrag).toHaveBeenCalled();
    expect(core.input.confirmPendingRowDrag).not.toHaveBeenCalled();
  });

  it("does not release container locks outside the browser", () => {
    const container = document.createElement("div");
    container.style.overflow = "hidden";
    const controller = new PendingRowDragController({
      getCore: () => null,
      getContainer: () => container,
      isBrowser: false,
      onDragConfirmed: vi.fn(),
    });

    controller.releaseLocks();

    expect(container.style.overflow).toBe("hidden");
  });
});

const ROW_HEIGHT = 32;

interface Row {
  id: number;
  name: string;
}

const dragColumns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 100, rowDrag: true },
  { field: "name", cellDataType: "text", width: 200 },
];

const bodyBounds: ContainerBounds = {
  top: 200,
  left: 0,
  width: 400,
  height: 320,
  scrollTop: 0,
  scrollLeft: 0,
};

const pointerInBody = (y: number): PointerEventData => ({
  clientX: 10,
  clientY: bodyBounds.top + y,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
});

const createDragGrid = async (frozenCount: number): Promise<GridCore<Row>> => {
  const data = Array.from({ length: 100 }, (_, id) => ({ id, name: `Name ${id}` }));
  const grid = new GridCore<Row>({
    columns: dragColumns,
    dataSource: createClientDataSource(data),
    rowHeight: ROW_HEIGHT,
    headerHeight: 36,
    overscan: 2,
  });
  await grid.initialize();
  grid.setViewport(0, 0, bodyBounds.width, bodyBounds.height);
  if (frozenCount > 0) grid.setFrozenRowsRequest({ requestedCount: frozenCount });
  return grid;
};

/** Start a row drag on the handle column and move the pointer to body y. */
const dragTo = (grid: GridCore<Row>, y: number): RowDragState | null => {
  grid.input.handleCellMouseDown(0, 0, pointerInBody(4));
  grid.input.handleDragMove(pointerInBody(y), bodyBounds);
  return grid.input.getDragState().rowDrag;
};

describe("row drag drop indicator region", () => {
  it("reports a frozen drop target with its region-local edge", async () => {
    const grid = await createDragGrid(3);
    expect(dragTo(grid, ROW_HEIGHT + 16)).toMatchObject({
      dropTargetIndex: 1,
      dropIndicatorRegion: "frozen",
      dropIndicatorY: ROW_HEIGHT,
    });
  });

  it("treats the frozen boundary as the block's bottom edge", async () => {
    const grid = await createDragGrid(3);
    const frozenExtent = grid.geometry.getRowRegions().frozenExtent;

    expect(frozenExtent).toBe(3 * ROW_HEIGHT);
    expect(dragTo(grid, 3 * ROW_HEIGHT + 1)).toMatchObject({
      dropTargetIndex: 3,
      dropIndicatorRegion: "frozen",
      dropIndicatorY: frozenExtent,
    });
  });

  it("keeps a suffix drop target in the suffix region with today's value", async () => {
    const grid = await createDragGrid(3);
    expect(dragTo(grid, 4 * ROW_HEIGHT + 16)).toMatchObject({
      dropTargetIndex: 4,
      dropIndicatorRegion: "suffix",
      dropIndicatorY: 4 * ROW_HEIGHT,
    });
  });

  it("reports suffix for every drop with count 0", async () => {
    const grid = await createDragGrid(0);
    expect(dragTo(grid, 16)).toMatchObject({
      dropTargetIndex: 0,
      dropIndicatorRegion: "suffix",
      dropIndicatorY: 0,
    });
    expect(dragTo(grid, 3 * ROW_HEIGHT + 1)).toMatchObject({
      dropTargetIndex: 3,
      dropIndicatorRegion: "suffix",
      dropIndicatorY: 3 * ROW_HEIGHT,
    });
  });
});

const COMPRESSED_ROW_COUNT = 400_000;
/** Deep in the compressed DOM range, far below the frozen band. */
const DEEP_DOM_TOP = 3_000_000;

/** 400,000 x 32 px exceeds the 10,000,000 px DOM scroll cap. */
const createCompressedDragGrid = async (frozenCount: number): Promise<GridCore<Row>> => {
  const dataSource = createServerDataSource<Row>(async (request) => {
    const { startRow, endRow } = request.range;
    const rows = Array.from({ length: endRow - startRow }, (_, index) => {
      const id = startRow + index;
      return { id, name: `Name ${id}` };
    });
    return { rows, totalRows: COMPRESSED_ROW_COUNT };
  });
  const grid = new GridCore<Row>({
    columns: dragColumns,
    dataSource,
    rowHeight: ROW_HEIGHT,
    headerHeight: 36,
    overscan: 2,
  });
  await grid.initialize();
  grid.setViewport(DEEP_DOM_TOP, 0, bodyBounds.width, bodyBounds.height);
  grid.setFrozenRowsRequest({ requestedCount: frozenCount });
  return grid;
};

describe("row drag drop indicator under compression", () => {
  it("keeps the frozen boundary at the block's bottom edge", async () => {
    const grid = await createCompressedDragGrid(3);
    // The live mapping sits deep while the pointer sample is the body's DOM
    // top: suffix-anchored `rows` space would resolve far below row 3.
    expect(grid.geometry.getContentSize().height).toBeGreaterThan(10_000_000);
    expect(grid.geometry.getRowBounds(3, "viewport")?.end).toBeLessThan(0);

    expect(dragTo(grid, 3 * ROW_HEIGHT + 1)).toMatchObject({
      dropTargetIndex: 3,
      dropIndicatorRegion: "frozen",
      dropIndicatorY: 3 * ROW_HEIGHT,
    });
  });

  it("keeps a frozen target at its content offset", async () => {
    const grid = await createCompressedDragGrid(3);
    expect(dragTo(grid, ROW_HEIGHT + 16)).toMatchObject({
      dropTargetIndex: 1,
      dropIndicatorRegion: "frozen",
      dropIndicatorY: ROW_HEIGHT,
    });
  });
});
