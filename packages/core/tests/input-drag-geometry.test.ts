import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, GridInstruction } from "../src/types";
import type { ContainerBounds, PointerEventData } from "../src/types/input";

interface Row {
  id: number;
  a: number;
  b: number;
  c: number;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: index, a: index, b: index, c: index }));

const columns = (): ColumnDefinition[] => [
  { field: "a", cellDataType: "number", width: 100, editable: true },
  { field: "b", cellDataType: "number", width: 100, editable: true },
  { field: "c", cellDataType: "number", width: 100, editable: true, rowDrag: true },
];

// The body scroll container: the header is rendered above `top`, outside it.
const bounds: ContainerBounds = {
  top: 200,
  left: 50,
  width: 300,
  height: 320,
  scrollTop: 0,
  scrollLeft: 0,
};

const pointerAt = (x: number, y: number): PointerEventData => ({
  clientX: bounds.left + x,
  clientY: bounds.top + y,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
});

const createGrid = async (): Promise<GridCore<Row>> => {
  const grid = new GridCore<Row>({
    columns: columns(),
    dataSource: createClientDataSource(rows(100)),
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    columnLayout: "fixed",
    getRowId: (row) => row.id,
  });
  await grid.initialize();
  grid.setViewport(0, 0, bounds.width, bounds.height);
  return grid;
};

const columnIds = (grid: GridCore<Row>): string[] =>
  grid.columns.get().map((column) => column.colId ?? column.field);

describe("pointer drags resolve through geometry", () => {
  it("targets the row under the pointer, measured from the body top", async () => {
    const grid = await createGrid();
    grid.input.handleCellMouseDown(1, 0, pointerAt(10, ROW_HEIGHT + 4));
    grid.input.startSelectionDrag();

    const middleOfRowThree = pointerAt(10, 3 * ROW_HEIGHT + ROW_HEIGHT / 2);
    expect(grid.input.handleDragMove(middleOfRowThree, bounds)).toMatchObject({
      targetRow: 3,
      targetCol: 0,
    });
    const topOfRowThree = pointerAt(10, 3 * ROW_HEIGHT + 1);
    expect(grid.input.handleDragMove(topOfRowThree, bounds)).toMatchObject({ targetRow: 3 });
  });

  it("maps the pointer to a layout index when a column on the left is hidden", async () => {
    const grid = await createGrid();
    grid.columns.setState([{ columnId: "a", hidden: true }]);
    grid.input.handleCellMouseDown(1, 1, pointerAt(10, ROW_HEIGHT + 4));
    grid.input.startSelectionDrag();

    // x = 150 is over the second displayed column, which is "c" (layout 2).
    const result = grid.input.handleDragMove(pointerAt(150, 3 * ROW_HEIGHT + 4), bounds);
    expect(result).toMatchObject({ targetRow: 3, targetCol: 2 });
    expect(grid.selection.getSelectionRange()).toMatchObject({
      startRow: 1,
      startCol: 1,
      endRow: 3,
      endCol: 2,
    });
  });

  it("clamps a pointer outside the cells to the nearest cell", async () => {
    const grid = await createGrid();
    grid.columns.setState([{ columnId: "a", hidden: true }]);
    grid.input.handleCellMouseDown(1, 1, pointerAt(10, ROW_HEIGHT + 4));
    grid.input.startSelectionDrag();

    expect(grid.input.handleDragMove(pointerAt(5000, 100_000), bounds)).toMatchObject({
      targetRow: 99,
      targetCol: 2,
    });
    expect(grid.input.handleDragMove(pointerAt(-40, -40), bounds)).toMatchObject({
      targetRow: 0,
      targetCol: 1,
    });
  });

  it("extends a fill drag to the row under the pointer", async () => {
    const grid = await createGrid();
    const instructions: GridInstruction[] = [];
    grid.onBatchInstruction((batch) => instructions.push(...batch));
    grid.input.handleFillHandleMouseDown({ row: 1, col: 0 }, null, pointerAt(90, 2 * ROW_HEIGHT - 4));

    grid.input.handleDragMove(pointerAt(10, 4 * ROW_HEIGHT + ROW_HEIGHT / 2), bounds);
    expect(instructions.findLast((instruction) => instruction.type === "UPDATE_FILL"))
      .toMatchObject({ targetRow: 4, targetCol: 0 });
  });

  it("commits a column move to the layout index of the drop target", async () => {
    const grid = await createGrid();
    grid.columns.setState([{ columnId: "a", hidden: true }]);
    // Drag "c" (layout 2, displayed 1) onto the first displayed column, "b".
    grid.input.handleHeaderMouseDown(2, 100, HEADER_HEIGHT, pointerAt(150, -10));
    grid.input.handleDragMove(pointerAt(10, -10), bounds);
    expect(grid.input.getDragState().columnMove).toMatchObject({
      dropTargetIndex: 0,
      dropIndicatorX: 0,
    });
    grid.input.handleDragEnd();

    expect(columnIds(grid)).toEqual(["a", "c", "b"]);
  });

  it("keeps a column move target on visible columns outside the viewport", async () => {
    const grid = await createGrid();
    const narrowBounds: ContainerBounds = {
      ...bounds,
      width: 100,
      scrollLeft: 100,
    };
    grid.setViewport(0, narrowBounds.scrollLeft, narrowBounds.width, narrowBounds.height);

    // Only "b" is visible. The pointer is captured outside either edge while
    // the adjacent columns remain mounted as overscan.
    grid.input.handleHeaderMouseDown(1, 100, HEADER_HEIGHT, pointerAt(50, -10));
    grid.input.handleDragMove(pointerAt(-40, -10), narrowBounds);
    expect(grid.input.getDragState().columnMove).toMatchObject({
      dropTargetIndex: 1,
      dropIndicatorX: 0,
    });

    grid.input.handleDragMove(pointerAt(140, -10), narrowBounds);
    expect(grid.input.getDragState().columnMove).toMatchObject({
      dropTargetIndex: 1,
      dropIndicatorX: 0,
    });
    grid.destroy();
  });

  it("targets the row drop edge under the pointer", async () => {
    const grid = await createGrid();
    grid.input.handleCellMouseDown(0, 2, pointerAt(250, 4));
    const result = grid.input.handleDragMove(pointerAt(250, 3 * ROW_HEIGHT + 4), bounds);
    expect(result).toMatchObject({ targetRow: 3 });
  });

  it("drops before the indicated end pin when base and displayed orders differ", async () => {
    const grid = await createGrid();
    try {
      grid.columns.setPinned("b", "end");
      expect(columnIds(grid)).toEqual(["a", "c", "b"]);

      grid.input.handleHeaderMouseDown(0, 100, HEADER_HEIGHT, pointerAt(50, -10));
      grid.input.handleDragMove(pointerAt(250, -10), bounds);
      expect(grid.input.getDragState().columnMove).toMatchObject({
        dropTargetIndex: 2,
        dropIndicatorX: 200,
      });
      grid.input.handleDragEnd();

      expect(columnIds(grid)).toEqual(["c", "a", "b"]);
      expect(grid.columns.getState().find((column) => column.columnId === "a")?.pinned).toBe("end");
    } finally {
      grid.destroy();
    }
  });
});

describe("scroll corrections", () => {
  it("corrects only the horizontal axis, inside the viewport batch", async () => {
    const grid = await createGrid();
    grid.setViewport(640, 0, 200, 320);
    const batches: GridInstruction[][] = [];
    grid.onBatchInstruction((batch) => batches.push(batch));

    // 300 px of columns in a 200 px viewport: 250 is past the reachable 100.
    grid.setViewport(640, 250, 200, 320);

    expect(batches).toHaveLength(1);
    const scrollTo = batches[0]!.find((instruction) => instruction.type === "SCROLL_TO");
    expect(scrollTo).toStrictEqual({ type: "SCROLL_TO", scrollTop: undefined, scrollLeft: 100 });
  });
});
