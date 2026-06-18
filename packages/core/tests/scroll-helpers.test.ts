import { describe, expect, it } from "vitest";
import {
  scrollCellIntoView,
  type ColumnScrollGeometry,
} from "../src/utils/scroll-helpers";
import type { SlotData } from "../src/types/ui-state";

const createContainer = (): HTMLElement => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { configurable: true, value: 300 });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 400 });
  return el;
};

const core = { getScrollTopForRow: (row: number) => row * 32 };
const noSlots = new Map<string, SlotData>();

// Columns: original index 1 is hidden; positions/widths are per VISIBLE column.
const geometry = (colIndex: number): ColumnScrollGeometry => ({
  colIndex,
  visibleColumns: [
    { originalIndex: 0 },
    { originalIndex: 2 },
    { originalIndex: 3 },
  ],
  columnPositions: [0, 100, 250],
  columnWidths: [100, 150, 120],
});

describe("scrollCellIntoView", () => {
  it("scrolls vertically to a row without a slot", () => {
    const container = createContainer();
    scrollCellIntoView(core, container, 50, 32, noSlots);
    expect(container.scrollTop).toBe(50 * 32);
  });

  it("right-aligns a column that ends beyond the right edge", () => {
    const container = createContainer();
    // Column 3 (visible index 2): left 250, right 370 > viewport right 300.
    scrollCellIntoView(core, container, 0, 32, noSlots, 0, geometry(3));
    expect(container.scrollLeft).toBe(370 - 300);
  });

  it("left-aligns a column that starts left of the viewport", () => {
    const container = createContainer();
    container.scrollLeft = 120;
    // Column 0: left 0 < scrollLeft 120.
    scrollCellIntoView(core, container, 0, 32, noSlots, 0, geometry(0));
    expect(container.scrollLeft).toBe(0);
  });

  it("keeps scrollLeft when the column is fully visible", () => {
    const container = createContainer();
    // Column 2 (visible index 1): left 100, right 250 within [0, 300].
    scrollCellIntoView(core, container, 0, 32, noSlots, 0, geometry(2));
    expect(container.scrollLeft).toBe(0);
  });

  it("ignores the horizontal axis for a hidden column", () => {
    const container = createContainer();
    container.scrollLeft = 40;
    // Original index 1 is not among the visible columns.
    scrollCellIntoView(core, container, 0, 32, noSlots, 0, geometry(1));
    expect(container.scrollLeft).toBe(40);
  });

  it("does not scroll horizontally when no geometry is provided", () => {
    const container = createContainer();
    container.scrollLeft = 40;
    scrollCellIntoView(core, container, 0, 32, noSlots, 0);
    expect(container.scrollLeft).toBe(40);
  });
});
