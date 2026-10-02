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
    const columnWindow = grid.geometry.getColumnWindow();
    const displayed = columnWindow.layout.columns.map((column) => column.columnId);
    return {
      columnWindow,
      bandCount: grid.header.getBands().count,
      displayedIndexOf: (columnId: string) => displayed.indexOf(columnId),
    };
  };

  it("describes each leaf by its mounted ancestors and gives each band its headers", () => {
    const input = { instance: "g", ...createWindow() };
    const { describedBy, owns } = resolveHeaderAssociations(input);
    const fragment = (fragmentId: string) => fragmentHeaderId("g", fragmentId);
    const leaf = (columnId: string) => leafHeaderId("g", columnId);

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
});
