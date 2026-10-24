// packages/core/tests/column-regions.test.ts

import { describe, expect, it } from "vitest";
import { getColumnRegionLayout, regionAtIndex } from "../src/geometry/column-regions";
import type { ColumnPin, DisplayedColumn } from "../src/types/geometry";

/** Displayed columns in layout order; the pin rides on the definition. */
const columns = (
  widths: Record<string, number>,
  pins: Record<string, ColumnPin> = {},
): DisplayedColumn[] => {
  let offset = 0;
  return Object.entries(widths).map(([columnId, width], layoutIndex) => {
    const displayed: DisplayedColumn = {
      columnId,
      layoutIndex,
      column: { field: columnId, cellDataType: "text", width, pinned: pins[columnId] },
      offset,
      width,
    };
    offset += width;
    return displayed;
  });
};

const total = (list: readonly DisplayedColumn[]): number =>
  list.reduce((sum, column) => sum + column.width, 0);

describe("column region admission", () => {
  it("admits start pins then end pins from what is left (B3 example)", () => {
    const list = columns({ A: 200, B: 200, C: 300, Z: 150 }, { A: "start", B: "start", Z: "end" });
    const regions = getColumnRegionLayout(list, 500, total(list));

    expect(regions).toMatchObject({
      centerStart: 2,
      centerEnd: 4,
      startWidth: 400,
      endWidth: 0,
      centerViewportWidth: 100,
    });
    expect(regionAtIndex(2, regions.centerStart, regions.centerEnd)).toBe("center");
    expect(regionAtIndex(3, regions.centerStart, regions.centerEnd)).toBe("center");
  });

  it("admits a pin that fits the width exactly", () => {
    const list = columns({ A: 200, B: 300 }, { A: "start", B: "end" });
    const regions = getColumnRegionLayout(list, 500, 500);
    expect(regions).toMatchObject({ centerStart: 1, centerEnd: 1, startWidth: 200, endWidth: 300 });
  });

  it("stops at the first start pin that does not fit", () => {
    const list = columns(
      { A: 200, B: 400, C: 100, Z: 50 },
      { A: "start", B: "start", Z: "end" },
    );
    const regions = getColumnRegionLayout(list, 500, 750);
    // B is rejected, which closes the start region; Z still fits the rest.
    expect(regions.startWidth).toBe(200);
    expect(regions.centerStart).toBe(1);
    expect(regions.centerEnd).toBe(3);
    expect(regions.endWidth).toBe(50);
    expect(regions.centerViewportWidth).toBe(250);
  });

  it("admits every pin when the viewport is unmeasured", () => {
    const list = columns({ A: 200, B: 200, Z: 150 }, { A: "start", Z: "end" });
    const regions = getColumnRegionLayout(list, 0, total(list));
    expect(regions).toMatchObject({ centerStart: 1, centerEnd: 2, startWidth: 200, endWidth: 150 });
  });

  it("rejects an over-wide start pin and leaves the center the whole viewport", () => {
    const list = columns({ A: 900, B: 100, C: 100 }, { A: "start" });
    const regions = getColumnRegionLayout(list, 300, total(list));
    expect(regions).toMatchObject({ centerStart: 0, centerEnd: 3, startWidth: 0 });
    expect(regions.centerViewportWidth).toBe(300);
  });

  it("puts a rejected end pin in the center without a gap", () => {
    const list = columns({ A: 100, B: 100, Y: 200, Z: 200 }, { Y: "end", Z: "end" });
    const regions = getColumnRegionLayout(list, 300, total(list));
    // Z is admitted, Y is rejected and joins the center before Z.
    expect(regions).toMatchObject({ centerStart: 0, centerEnd: 3, endWidth: 200 });
    expect(regionAtIndex(2, regions.centerStart, regions.centerEnd)).toBe("center");
    expect(regionAtIndex(3, regions.centerStart, regions.centerEnd)).toBe("end");
  });

  it("reports the end region abutting narrow content", () => {
    const list = columns({ A: 100, Z: 50 }, { Z: "end" });
    const regions = getColumnRegionLayout(list, 500, total(list));
    expect(regions.endOffset).toBe(100);
  });

  it("re-admits a pin once the viewport widens", () => {
    const list = columns({ A: 200, B: 200, Z: 150 }, { A: "start", Z: "end" });

    const narrow = getColumnRegionLayout(list, 200, total(list));
    expect(narrow.endWidth).toBe(0);
    expect(narrow.centerEnd).toBe(3);

    const wide = getColumnRegionLayout(list, 500, total(list));
    expect(wide.endWidth).toBe(150);
    expect(wide.centerEnd).toBe(2);
  });

  it("treats a full-width pin as center when it cannot fit", () => {
    const list = columns({ A: 600, B: 100 }, { A: "start" });
    const regions = getColumnRegionLayout(list, 500, total(list));
    expect(regions.startWidth).toBe(0);
    expect(regions.centerEnd).toBe(2);
    expect(regions.centerViewportWidth).toBe(500);
  });
});
