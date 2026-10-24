// packages/core/tests/grid-core-frozen-compression.test.ts

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { applyInstruction } from "../src/state-reducer";
import type { ColumnDefinition, GridInstruction } from "../src/types";
import type { HeaderData, SlotData } from "../src/types/ui-state";

interface Row {
  id: number;
}

const ROW_HEIGHT = 32;
const ROW_COUNT = 1_000_000;
const HEIGHT = 320;

const columns: ColumnDefinition[] = [{ field: "id", cellDataType: "number", width: 80 }];

const createCompressedGrid = async () => {
  const data = Array.from({ length: ROW_COUNT }, (_, id) => ({ id }));
  const grid = new GridCore<Row>({
    columns,
    dataSource: createClientDataSource(data),
    rowHeight: ROW_HEIGHT,
    headerHeight: 36,
    overscan: 2,
    freezeRows: { count: 3 },
  });
  const slots = new Map<string, SlotData<Row>>();
  const headers = new Map<string, HeaderData>();
  let wrapperOffset = 0;
  grid.onBatchInstruction((batch: GridInstruction[]) => {
    for (const instruction of batch) {
      const change = applyInstruction(instruction, slots, headers);
      if (change?.rowsWrapperOffset !== undefined) wrapperOffset = change.rowsWrapperOffset;
    }
  });
  await grid.initialize();
  const suffixTop = (rowIndex: number, domScrollTop: number): number | undefined => {
    const slot = [...slots.values()].find((candidate) => candidate.rowIndex === rowIndex);
    if (slot === undefined) return undefined;
    return wrapperOffset + slot.translateY - domScrollTop;
  };
  return { grid, suffixTop };
};

describe("GridCore — frozen rows under scroll compression", () => {
  it("renders the first suffix row right below the frozen block", async () => {
    const { grid, suffixTop } = await createCompressedGrid();
    for (const domScrollTop of [0, 4_000_000, 9_000_000]) {
      grid.setViewport(domScrollTop, 0, 400, HEIGHT);
      const first = grid.geometry.getVisibleRowWindow().start;
      const expected = grid.geometry.getRowBounds(first, "viewport")?.start;
      expect(first).toBeGreaterThanOrEqual(3);
      expect(expected).toBeGreaterThan(2 * ROW_HEIGHT);
      expect(suffixTop(first, domScrollTop), `dom ${domScrollTop}`).toBeCloseTo(expected ?? NaN, 6);
    }
  });
});
