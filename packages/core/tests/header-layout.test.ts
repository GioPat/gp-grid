// packages/core/tests/header-layout.test.ts
// PRD 007 D9 header helpers: band boxes, escaped DOM ids and the ARIA
// associations of a mounted window.

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import {
  escapeDomIdPart,
  fragmentHeaderBox,
  fragmentHeaderId,
  leafHeaderBox,
  leafHeaderId,
  resolveHeaderAssociations,
} from "../src/header-layout";
import type { ColumnGroupChild, ColumnGroupDefinition } from "../src/types";
import type { HeaderBandLayout } from "../src/types/geometry";

const bands: HeaderBandLayout = {
  count: 3,
  heights: [30, 72, 30],
  offsets: [0, 30, 102],
  totalHeight: 132,
};

const group = (groupId: string, ...children: ColumnGroupChild[]): ColumnGroupDefinition => ({
  groupId,
  children,
});

describe("header band boxes", () => {
  it("spans a leaf from its first band to the bottom and fills a fragment's band", () => {
    expect(leafHeaderBox(bands, 0)).toEqual({ top: 0, height: 132 });
    expect(leafHeaderBox(bands, 2)).toEqual({ top: 102, height: 30 });
    expect(fragmentHeaderBox(bands, 1)).toEqual({ top: 30, height: 72 });
  });

  it.each([-1, 3])("spans a leaf over the header and collapses a fragment at band %i, outside the layout", (band) => {
    expect(leafHeaderBox(bands, band)).toEqual({ top: 0, height: 132 });
    expect(fragmentHeaderBox(bands, band)).toEqual({ top: 0, height: 0 });
  });
});

describe("header DOM ids", () => {
  it("keeps ASCII letters and digits", () => {
    expect(escapeDomIdPart("Az09")).toBe("Az09");
  });

  it("escapes spaces, hyphens, underscores and non-ASCII characters by code point", () => {
    expect(escapeDomIdPart("a b")).toBe("a_20_b");
    expect(escapeDomIdPart("a-b")).toBe("a_2d_b");
    expect(escapeDomIdPart("a_b")).toBe("a_5f_b");
    expect(escapeDomIdPart("région")).toBe("r_e9_gion");
    expect(escapeDomIdPart("日本")).toBe("_65e5__672c_");
    expect(escapeDomIdPart("x😀")).toBe("x_1f600_");
  });

  it("escapes every part of an id into a valid IDREF", () => {
    expect(leafHeaderId("_r_1_", "unit price")).toBe("_5f_r_5f_1_5f_-h-unit_20_price");
    expect(fragmentHeaderId(":r0:", "Q1:center:0")).toBe("_3a_r0_3a_-Q1_3a_center_3a_0");
    for (const id of [leafHeaderId("«r0»", "a\tb"), fragmentHeaderId("app 1", "G é:end:2")]) {
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("never gives distinct inputs the same id", () => {
    const columnIds = ["a b", "a_20_b", "a_b", "a_5f_b", "a:b", "a_3a_b", "a-b", "a_2d_b"];
    const ids = columnIds.map((columnId) => leafHeaderId("g", columnId));
    expect(new Set(ids).size).toBe(columnIds.length);
  });

  it("never gives a leaf and a fragment the same id", () => {
    // Group `h-a` over column `a:center:0`: equal ids if `-` were kept.
    expect(leafHeaderId("g", "a:center:0")).toBe("g-h-a_3a_center_3a_0");
    expect(fragmentHeaderId("g", "h-a:center:0")).toBe("g-h_2d_a_3a_center_3a_0");
    expect(fragmentHeaderId("g-h", "a:center:0")).not.toBe(leafHeaderId("g", "a:center:0"));
  });
});

describe("header associations", () => {
  const fragment = (fragmentId: string) => fragmentHeaderId("g", fragmentId);
  const leaf = (columnId: string) => leafHeaderId("g", columnId);

  const windowOf = (grid: GridCore<Record<string, unknown>>) => {
    const columnWindow = grid.geometry.getColumnWindow();
    const displayed = columnWindow.layout.columns.map((column) => column.columnId);
    return {
      columnWindow,
      bandCount: grid.header.getBands().count,
      displayedIndexOf: (columnId: string) => displayed.indexOf(columnId),
    };
  };

  /** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and `x`, with `a` pinned to the start. */
  const createWindow = () => {
    const grid = new GridCore<Record<string, unknown>>({
      columns: ["a", "b", "c", "d", "e", "f", "x"].map((field) => ({ field, cellDataType: "text", width: 100 })),
      columnGroups: [
        group("Region", group("North", group("Q1", "a", "b"), "c"), "d"),
        group("Totals", "e", "f"),
        "x",
      ],
      dataSource: createClientDataSource([{ a: 1 }]),
      rowHeight: 32,
      columnLayout: "fixed",
    });
    grid.setViewport(0, 0, 2_000, 300);
    grid.columns.setPinned("a", "start");
    return windowOf(grid);
  };

  /**
   * `G0{c0, c1}` to `G5{c10, c11}`, 100 px each in a 300 px body scrolled to
   * `scrollLeft`, with an open edit keeping `edited` mounted outside the range.
   */
  const createRetainedWindow = (edited: string, scrollLeft: number) => {
    const ids = Array.from({ length: 12 }, (_, index) => `c${index}`);
    const grid = new GridCore<Record<string, unknown>>({
      columns: ids.map((field) => ({ field, cellDataType: "text", width: 100, editable: true })),
      columnGroups: Array.from({ length: 6 }, (_, index) =>
        group(`G${index}`, ...ids.slice(2 * index, 2 * index + 2)),
      ),
      dataSource: createClientDataSource([{ c0: 1 }]),
      rowHeight: 32,
      columnLayout: "fixed",
      columnOverscan: 0,
    });
    grid.setViewport(0, 0, 300, 300);
    grid.edit.start(0, ids.indexOf(edited));
    grid.setViewport(0, scrollLeft, 300, 300);
    return windowOf(grid);
  };

  it("describes each leaf by its mounted ancestors and gives each band its headers", () => {
    const input = { instance: "g", ...createWindow() };
    const { describedBy, owns } = resolveHeaderAssociations(input);

    expect(input.bandCount).toBe(4);
    expect(describedBy.get("a"))
      .toBe([fragment("Region:start:0"), fragment("North:start:0"), fragment("Q1:start:0")].join(" "));
    expect(describedBy.get("b"))
      .toBe([fragment("Region:center:0"), fragment("North:center:0"), fragment("Q1:center:0")].join(" "));
    expect(describedBy.get("d")).toBe(fragment("Region:center:0"));
    expect(describedBy.has("x")).toBe(false);
    expect(owns).toEqual([
      [fragment("Region:start:0"), fragment("Region:center:0"), fragment("Totals:center:0"), leaf("x")].join(" "),
      [fragment("North:start:0"), fragment("North:center:0"), leaf("d"), leaf("e"), leaf("f")].join(" "),
      [fragment("Q1:start:0"), fragment("Q1:center:0"), leaf("c")].join(" "),
      [leaf("a"), leaf("b")].join(" "),
    ]);
  });

  it.each([
    {
      edited: "c0",
      scrollLeft: 900,
      ancestors: { c9: "G4", c10: "G5", c11: "G5" },
      leaves: ["c0", "c9", "c10", "c11"],
    },
    {
      edited: "c11",
      scrollLeft: 0,
      ancestors: { c0: "G0", c1: "G0", c2: "G1" },
      leaves: ["c0", "c1", "c2", "c11"],
    },
  ])("leaves $edited undescribed while its ancestor is outside the mounted range", (scenario) => {
    const input = { instance: "g", ...createRetainedWindow(scenario.edited, scenario.scrollLeft) };
    const { describedBy, owns } = resolveHeaderAssociations(input);
    const expected = Object.entries(scenario.ancestors).map(([columnId, groupId]) => [
      columnId,
      fragment(`${groupId}:center:0`),
    ]);

    expect(input.columnWindow.center.map((column) => column.columnId)).toEqual(scenario.leaves);
    expect(Object.fromEntries(describedBy)).toEqual(Object.fromEntries(expected));
    expect(owns[1]).toBe(scenario.leaves.map(leaf).join(" "));
  });

  it("leaves out the headers and ancestors of bands past bandCount", () => {
    const input = { instance: "g", ...createWindow(), bandCount: 2 };
    const { describedBy, owns } = resolveHeaderAssociations(input);

    expect(describedBy.get("a")).toBe([fragment("Region:start:0"), fragment("North:start:0")].join(" "));
    expect(describedBy.get("c")).toBe([fragment("Region:center:0"), fragment("North:center:0")].join(" "));
    expect(owns).toEqual([
      [fragment("Region:start:0"), fragment("Region:center:0"), fragment("Totals:center:0"), leaf("x")].join(" "),
      [fragment("North:start:0"), fragment("North:center:0"), leaf("d"), leaf("e"), leaf("f")].join(" "),
    ]);
  });
});
