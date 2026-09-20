import { describe, expect, it } from "vitest";
import { createRowGeometry, type RowGeometryDeps } from "../src/geometry/row-geometry";

interface HarnessOptions {
  rowCount?: number;
  rowHeight?: number;
  viewportHeight?: number;
  domScrollTop?: number;
  overscan?: number;
  ratio?: number;
}

const createRows = (options: HarnessOptions = {}) => {
  const deps: RowGeometryDeps = {
    getRowCount: () => options.rowCount ?? 1000,
    getRowHeight: () => options.rowHeight ?? 32,
    getViewportHeight: () => options.viewportHeight ?? 320,
    getOverscan: () => options.overscan ?? 3,
    mapping: {
      getDomScrollTop: () => options.domScrollTop ?? 0,
      toDomScrollTop: (logical) => logical * (options.ratio ?? 1),
      toLogicalScrollTop: (dom) => (options.ratio !== undefined && options.ratio < 1 ? dom / options.ratio : dom),
      isScalingActive: () => options.ratio !== undefined && options.ratio < 1,
      getMaxLogicalScrollTop: () =>
        Math.max(
          0,
          (options.rowCount ?? 1000) * (options.rowHeight ?? 32) - (options.viewportHeight ?? 320),
        ),
    },
  };
  const rows = createRowGeometry(deps);
  rows.syncAxis();
  return rows;
};

describe("row geometry windows", () => {
  it("computes half-open windows and the first visible index", () => {
    const rows = createRows({ domScrollTop: 64, viewportHeight: 320, overscan: 3 });
    expect(rows.getVisibleWindow()).toEqual({ start: 2, end: 12 });
    expect(rows.getWindow()).toEqual({ start: 0, end: 15 });
    expect(rows.getFirstVisibleIndex()).toBe(2);
  });

  it("keeps a zero-height viewport empty even with overscan", () => {
    const rows = createRows({ viewportHeight: 0, overscan: 5 });
    expect(rows.getWindow()).toEqual({ start: 0, end: 0 });
    expect(rows.getVisibleWindow()).toEqual({ start: 0, end: 0 });
  });

  it("keeps an empty axis empty", () => {
    const rows = createRows({ rowCount: 0 });
    expect(rows.getAxis().count).toBe(0);
    expect(rows.getWindow()).toEqual({ start: 0, end: 0 });
    expect(rows.getFirstVisibleIndex()).toBe(0);
  });

  it("covers a fractional viewport height", () => {
    const rows = createRows({ domScrollTop: 50.5, viewportHeight: 300.5 });
    expect(rows.getVisibleWindow()).toEqual({ start: 1, end: 11 });
  });
});

describe("bootstrap row estimate", () => {
  it("covers the viewport plus overscan and rounds a partial row up", () => {
    expect(createRows({ rowCount: 0, viewportHeight: 320, overscan: 3 }).getBootstrapRowCount()).toBe(13);
    expect(createRows({ rowCount: 0, viewportHeight: 330, overscan: 0 }).getBootstrapRowCount()).toBe(11);
  });

  it("requests nothing for a collapsed or unmeasurable viewport", () => {
    expect(createRows({ viewportHeight: 0, overscan: 5 }).getBootstrapRowCount()).toBe(0);
    expect(createRows({ viewportHeight: -10 }).getBootstrapRowCount()).toBe(0);
    expect(createRows({ viewportHeight: Number.NaN }).getBootstrapRowCount()).toBe(0);
    expect(createRows({ viewportHeight: Number.POSITIVE_INFINITY }).getBootstrapRowCount()).toBe(0);
  });
});

describe("rows-space invariant", () => {
  it("keeps wrapperOffset + rowPosition − domScrollTop = rowOffset − logicalScrollTop", () => {
    const cases = [
      { domScrollTop: 0, ratio: 1 },
      { domScrollTop: 123.5, ratio: 1 },
      { domScrollTop: 100_000, ratio: 0.01 },
      { domScrollTop: 987.654, ratio: 0.04 },
    ];
    for (const testCase of cases) {
      const rows = createRows({
        rowCount: 1_000_000,
        viewportHeight: 320,
        domScrollTop: testCase.domScrollTop,
        ratio: testCase.ratio,
      });
      const mapper = rows.getMapper();
      const logical = mapper.getLogicalScrollTop();
      for (const viewIndex of [0, 1, 7, 500_000]) {
        const left = mapper.wrapperOffset() + mapper.rowPosition(viewIndex) - testCase.domScrollTop;
        const right = rows.getRowOffset(viewIndex) - logical;
        expect(left, `index ${viewIndex} ratio ${testCase.ratio}`).toBeCloseTo(right, 6);
      }
    }
  });

  it("uses no wrapper offset and content positions when uncompressed", () => {
    const rows = createRows({ domScrollTop: 123.5 });
    const mapper = rows.getMapper();
    expect(mapper.wrapperOffset()).toBe(0);
    expect(mapper.rowPosition(3)).toBe(96);
    expect(rows.getRowViewportTop(3)).toBe(96 - 123.5);
  });

  it("positions rows relative to the logical top when compressed", () => {
    const rows = createRows({ rowCount: 1_000_000, domScrollTop: 100_000, ratio: 0.01 });
    const mapper = rows.getMapper();
    const logical = mapper.getLogicalScrollTop();
    expect(logical).toBe(10_000_000);
    expect(mapper.rowPosition(312_500)).toBe(10_000_000 - logical);
    expect(mapper.wrapperOffset()).toBe(100_000 - (logical % 32));
  });
});

describe("rows-space anchor", () => {
  it("clamps the anchor to the first row for a sample before the content", () => {
    const rows = createRows({ rowCount: 1000, domScrollTop: -500, ratio: 0.5 });
    expect(rows.getMapper().rowPosition(0)).toBe(0);
    expect(rows.getMapper().rowPosition(3)).toBe(96);
  });

  it("clamps the anchor to the end edge for a sample past the content", () => {
    const rows = createRows({ rowCount: 1000, domScrollTop: 1_000_000, ratio: 0.5 });
    expect(rows.getMapper().rowPosition(1000)).toBe(0);
    expect(rows.getMapper().rowPosition(999)).toBe(-32);
  });

  it("anchors an empty axis at zero", () => {
    const rows = createRows({ rowCount: 0, domScrollTop: 400, ratio: 0.5 });
    expect(rows.getMapper().rowPosition(0)).toBe(0);
    expect(rows.getMapper().wrapperOffset()).toBe(400 - 800);
  });
});

describe("scroll mapping", () => {
  it("converts between DOM and logical only when compression is active", () => {
    const plain = createRows({ domScrollTop: 500 });
    expect(plain.getMapper().toLogicalScrollTop(500)).toBe(500);
    expect(plain.getMapper().toDomScrollTop(500)).toBe(500);
    expect(plain.getMapper().hasVerticalCompression()).toBe(false);

    const compressed = createRows({ rowCount: 1_000_000, domScrollTop: 320, ratio: 0.01 });
    expect(compressed.getMapper().toLogicalScrollTop(320)).toBe(32_000);
    expect(compressed.getMapper().toDomScrollTop(32_000)).toBeCloseTo(320, 6);
    expect(compressed.getMapper().hasVerticalCompression()).toBe(true);
  });

  it("reports the maximum logical scroll without rounding", () => {
    const rows = createRows({ rowCount: 1000, rowHeight: 32, viewportHeight: 300 });
    expect(rows.getMapper().getMaxLogicalScrollTop()).toBe(32_000 - 300);
    const empty = createRows({ rowCount: 0, viewportHeight: 300 });
    expect(empty.getMapper().getMaxLogicalScrollTop()).toBe(0);
  });

  it("clamps a DOM conversion to the reachable range and preserves fractions", () => {
    const rows = createRows({ rowCount: 100, rowHeight: 32, viewportHeight: 320 });
    const mapper = rows.getMapper();
    expect(mapper.toDomScrollTopClamped(-50)).toBe(0);
    expect(mapper.toDomScrollTopClamped(5000)).toBe(2880);
    expect(mapper.toDomScrollTopClamped(123.5)).toBe(123.5);

    const compressed = createRows({
      rowCount: 1_000_000,
      rowHeight: 32,
      viewportHeight: 320,
      ratio: 0.01,
    });
    const compressedMapper = compressed.getMapper();
    expect(compressedMapper.toDomScrollTopClamped(0)).toBe(0);
    expect(compressedMapper.toDomScrollTopClamped(Number.MAX_SAFE_INTEGER))
      .toBeCloseTo(compressedMapper.toDomScrollTop(compressedMapper.getMaxLogicalScrollTop()), 3);
  });
});

describe("compressed range without scroll", () => {
  it("answers 0 instead of dividing by an empty logical range", () => {
    // Content shorter than the viewport while a mapping still reports scaling.
    const rows = createRows({ rowCount: 5, viewportHeight: 320, ratio: 0.5 });
    expect(rows.getMapper().getMaxLogicalScrollTop()).toBe(0);
    expect(rows.getMapper().toDomScrollTopClamped(64)).toBe(0);
    expect(rows.getMapper().toDomScrollTopClamped(-64)).toBe(0);
  });
});

describe("row edges", () => {
  it("accepts the end insertion edge and rejects invalid boundaries", () => {
    const rows = createRows({ rowCount: 10, rowHeight: 20 });
    expect(rows.getRowEdgeOffset(0, "content")).toBe(0);
    expect(rows.getRowEdgeOffset(10, "content")).toBe(200);
    expect(rows.getRowEdgeOffset(10, "viewport")).toBe(200);
    expect(rows.getRowEdgeOffset(-1, "content")).toBeUndefined();
    expect(rows.getRowEdgeOffset(11, "content")).toBeUndefined();
    expect(rows.getRowEdgeOffset(1.5, "content")).toBeUndefined();
  });

  it("answers rows-space edges through the mapper", () => {
    const rows = createRows({ rowCount: 1000, domScrollTop: 96 });
    expect(rows.getRowEdgeOffset(5, "rows")).toBe(160);

    // Compressed: the anchor is the first visible row, so rows are positioned
    // by their distance from it rather than by their absolute offset.
    const compressed = createRows({
      rowCount: 1_000_000,
      domScrollTop: 32_000,
      ratio: 0.01,
    });
    expect(compressed.getRowEdgeOffset(100_000, "content")).toBe(3_200_000);
    expect(compressed.getRowEdgeOffset(100_000, "rows")).toBe(0);
    expect(compressed.getRowEdgeOffset(100_005, "rows")).toBe(160);
    expect(compressed.getRowEdgeOffset(100_010, "rows")).toBe(320);
  });
});
