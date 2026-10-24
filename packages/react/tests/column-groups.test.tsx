// packages/react/tests/column-groups.test.tsx
// PRD 007 D9 in React: grouped header bands, fragments and their ARIA
// associations, the flat header kept as it was, rejected hierarchies and the
// header-height readers following the bands.

import { describe, it, expect, afterEach, vi } from "vitest";
import type { MutableRefObject } from "react";
import { render, act, waitFor, fireEvent } from "@testing-library/react";
import { createClientDataSource, createServerDataSource, escapeDomIdPart } from "@gp-grid/core";
import type { ColumnDefinition, ColumnGroupChild, ColumnGroupDefinition } from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridProps, GridRef } from "../src/types";

type Row = Record<string, string>;
type GridHandle = MutableRefObject<GridRef<Row> | null>;

const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 32;

const column = (id: string): ColumnDefinition => ({ colId: id, field: id, cellDataType: "text", width: 100 });

const group = (groupId: string, ...children: ColumnGroupChild[]): ColumnGroupDefinition => ({
  groupId,
  headerName: `${groupId} name`,
  children,
});

/** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
const prdFixture = (): ColumnGroupChild[] => [
  group("Region", group("North", group("Q1", "a", "b"), "c"), "d"),
  group("Totals", "e", "f"),
  "x",
];

const columns = ["a", "b", "c", "d", "e", "f", "x"].map(column);
const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ a: `a${i}`, x: `x${i}` }));
const dataSource = createClientDataSource(rows);

const gridProps = (gridRef: GridHandle, overrides: Partial<GridProps<Row>> = {}): GridProps<Row> => ({
  columns,
  dataSource,
  rowHeight: ROW_HEIGHT,
  headerHeight: HEADER_HEIGHT,
  columnLayout: "fixed",
  gridRef,
  ...overrides,
});

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(selector));

const one = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`${selector} is not mounted`);
  return element;
};

const fragmentsIn = (container: HTMLElement): string[] =>
  all(".gp-grid-header-group", container).map((fragment) => fragment.dataset.fragment ?? "");

const leafHeader = (columnId: string): HTMLElement => {
  const cell = all(".gp-grid-header-cell[data-col-index]")
    .find((header) => header.id.endsWith(`-h-${columnId}`));
  if (cell === undefined) throw new Error(`header ${columnId} is not mounted`);
  return cell;
};

const fragment = (fragmentId: string): HTMLElement => one(`[data-fragment="${fragmentId}"]`);

const boxOf = (element: HTMLElement): [string, string] => [element.style.top, element.style.height];

const renderGrouped = async (overrides: Partial<GridProps<Row>> = {}) => {
  const gridRef: GridHandle = { current: null };
  const view = render(<Grid {...gridProps(gridRef, { columnGroups: prdFixture(), ...overrides })} />);
  await waitFor(() => {
    expect(all(".gp-grid-header-group").length).toBeGreaterThan(0);
    expect(all(".gp-grid-cell").length).toBeGreaterThan(0);
  });
  const core = gridRef.current?.core;
  if (!core) throw new Error("core is not mounted");
  return { gridRef, view, core };
};

/** Tag and attributes of the header root, its containers and its cells, ids left out. */
const headerSkeleton = (): string[] => {
  const lines: string[] = [];
  const visit = (element: Element, depth: number): void => {
    const attributes = Array.from(element.attributes)
      .filter((attribute) => attribute.name !== "id")
      .map((attribute) => `${attribute.name}="${attribute.value}"`)
      .join(" ");
    lines.push(`${"  ".repeat(depth)}<${element.tagName.toLowerCase()} ${attributes}>`);
    if (element.classList.contains("gp-grid-header-cell")) return;
    for (const child of Array.from(element.children)) visit(child, depth + 1);
  };
  visit(one(".gp-grid-header"), 0);
  return lines;
};

describe("Grid column groups", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the PRD fixture in four bands with its fragments per region", async () => {
    await renderGrouped({ columnState: [{ columnId: "a", pinned: "start" }] });

    const header = one(".gp-grid-header");
    expect(header.getAttribute("role")).toBe("rowgroup");
    expect(header.style.height).toBe(`${4 * HEADER_HEIGHT}px`);
    expect(fragmentsIn(one('[data-pin-region="start"]')))
      .toEqual(["Region:start:0", "North:start:0", "Q1:start:0"]);
    expect(fragmentsIn(header.children[4] as HTMLElement))
      .toEqual(["Region:center:0", "Totals:center:0", "North:center:0", "Q1:center:0"]);

    expect(boxOf(fragment("Region:center:0"))).toEqual(["0px", "30px"]);
    expect(boxOf(fragment("Q1:start:0"))).toEqual(["60px", "30px"]);
    expect(boxOf(leafHeader("a"))).toEqual(["90px", "30px"]);
    expect(boxOf(leafHeader("d"))).toEqual(["30px", "90px"]);
    expect(boxOf(leafHeader("x"))).toEqual(["0px", "120px"]);
    expect(fragment("North:center:0").textContent).toBe("North name");
  });

  it("gives fragments and leaves their ids and ARIA associations", async () => {
    await renderGrouped({ columnState: [{ columnId: "a", pinned: "start" }] });
    const region = fragment("Region:center:0");
    // The useId prefix is escaped like every other id part.
    const instance = region.id.slice(0, -`-${escapeDomIdPart("Region:center:0")}`.length);
    expect(instance).toMatch(/^[A-Za-z0-9_]+$/);
    const id = (fragmentId: string) => `${instance}-${escapeDomIdPart(fragmentId)}`;
    const leaf = (columnId: string) => `${instance}-h-${escapeDomIdPart(columnId)}`;

    expect(region.getAttribute("role")).toBe("columnheader");
    expect(region.dataset.groupId).toBe("Region");
    expect(region.dataset.band).toBe("0");
    expect([region.getAttribute("aria-colindex"), region.getAttribute("aria-colspan")]).toEqual(["2", "3"]);
    expect(region.getAttribute("aria-rowindex")).toBe("1");

    const a = leafHeader("a");
    expect(a.id).toBe(leaf("a"));
    expect([a.getAttribute("aria-rowindex"), a.getAttribute("aria-rowspan")]).toEqual(["4", "1"]);
    expect(a.getAttribute("aria-describedby"))
      .toBe([id("Region:start:0"), id("North:start:0"), id("Q1:start:0")].join(" "));
    expect(leafHeader("d").getAttribute("aria-describedby")).toBe(id("Region:center:0"));
    expect(leafHeader("x").hasAttribute("aria-describedby")).toBe(false);
    expect(leafHeader("x").getAttribute("aria-rowspan")).toBe("4");

    const bandRows = all('.gp-grid-header > [role="row"]');
    expect(bandRows.map((row) => row.getAttribute("aria-rowindex"))).toEqual(["1", "2", "3", "4"]);
    expect(bandRows.map((row) => row.getAttribute("aria-owns"))).toEqual([
      [id("Region:start:0"), id("Region:center:0"), id("Totals:center:0"), leaf("x")].join(" "),
      [id("North:start:0"), id("North:center:0"), leaf("d"), leaf("e"), leaf("f")].join(" "),
      [id("Q1:start:0"), id("Q1:center:0"), leaf("c")].join(" "),
      [leaf("a"), leaf("b")].join(" "),
    ]);
    for (const row of bandRows) expect(row.children).toHaveLength(0);
  });

  it("keeps fragments out of the leaf index space and the tab order", async () => {
    await renderGrouped();
    const fragments = all(".gp-grid-header-group");
    expect(fragments).toHaveLength(4);
    for (const element of fragments) {
      expect(element.hasAttribute("data-col-index")).toBe(false);
      expect(element.hasAttribute("tabindex")).toBe(false);
      expect(element.querySelectorAll("button, [tabindex], .gp-grid-header-resize-handle")).toHaveLength(0);
    }
    expect(all(".gp-grid-header-cell[data-col-index]")).toHaveLength(columns.length);
  });

  it("keeps the flat header markup apart from the ids", async () => {
    const flatColumns: ColumnDefinition[] = [
      { colId: "a", field: "a", cellDataType: "text", width: 100, pinned: "start" },
      { colId: "b", field: "b", cellDataType: "text", width: 100, resizable: false },
      { colId: "c", field: "c", cellDataType: "number", width: 100, headerName: "C" },
      { colId: "d", field: "d", cellDataType: "text", width: 100, pinned: "end" },
    ];
    render(
      <Grid
        columns={flatColumns}
        dataSource={createClientDataSource([{ a: "1", b: "2", c: 3, d: "4" }])}
        rowHeight={30}
        headerHeight={40}
        columnLayout="fixed"
      />,
    );
    await waitFor(() => expect(all(".gp-grid-cell").length).toBeGreaterThan(0));

    const cell = (colIndex: number, region: string, offset: number) =>
      `    <div class="gp-grid-header-cell" role="columnheader" aria-colindex="${colIndex + 1}" ` +
      `data-col-index="${colIndex}" data-cell-region="${region}" ` +
      `style="inset-inline-start: ${offset}px; width: 100px; height: 40px;">`;
    const withoutCellTop = (line: string) =>
      line.includes("gp-grid-header-cell") ? line.replace(" top: 0px;", "") : line;
    const skeleton = headerSkeleton().map(withoutCellTop);
    expect(skeleton).toEqual([
      '<div class="gp-grid-header" role="row" aria-rowindex="1" style="height: 40px;">',
      '  <div role="presentation" style="position: absolute; top: 0px; inset-inline-start: 0; transform: translateX(0px); width: 400px; height: 40px;">',
      cell(1, "center", 100),
      cell(2, "center", 200),
      '  <div class="gp-grid-pin-header" role="presentation" data-pin-region="start" style="inset-inline-start: 0; width: 100px; height: 40px;">',
      cell(0, "start", 0),
      '  <div class="gp-grid-pin-header" role="presentation" data-pin-region="end" style="inset-inline-start: 300px; width: 100px; height: 40px;">',
      cell(3, "end", 0),
      '  <div class="gp-grid-header-gutter" role="presentation" style="inset-inline-start: 800px; height: 40px;">',
    ]);
    const ids = all(".gp-grid-header-cell").map((header) => header.id);
    const instance = ids[0]?.slice(0, -"-h-b".length);
    expect(ids).toEqual(["b", "c", "a", "d"].map((columnId) => `${instance}-h-${columnId}`));
  });

  it("keeps the previous header and reports a rejected columnGroups prop", async () => {
    const onColumnSchemaRejected = vi.fn();
    const { gridRef, view } = await renderGrouped({ onColumnSchemaRejected });
    const before = fragmentsIn(one(".gp-grid-header"));

    await act(async () => {
      view.rerender(
        <Grid {...gridProps(gridRef, { columnGroups: [group("G", "a", "b")], onColumnSchemaRejected })} />,
      );
    });

    expect(onColumnSchemaRejected).toHaveBeenCalledTimes(1);
    expect(onColumnSchemaRejected.mock.calls[0]?.[0]).toMatchObject({ code: "missingLeaf", source: "groups" });
    expect(fragmentsIn(one(".gp-grid-header"))).toEqual(before);
    expect(all('.gp-grid-header > [role="row"]')).toHaveLength(4);
    expect(one('[role="status"]').textContent).toContain('Column "c" is missing');
  });

  it("moves the body sizer and the overlays with a band height", async () => {
    const { gridRef, view } = await renderGrouped({ rowResize: true });
    const sizer = one(".gp-grid-body-scroll > div");
    const rowsExtent = `${rows.length * ROW_HEIGHT}px`;
    expect(sizer.style.height).toBe(rowsExtent);

    const columnGroups = gridRef.current?.core?.columns.getGroups() ?? [];
    await act(async () => {
      view.rerender(<Grid {...gridProps(gridRef, { columnGroups, rowResize: true, headerBandHeights: [72] })} />);
    });
    const total = 72 + 3 * HEADER_HEIGHT;
    expect(one(".gp-grid-header").style.height).toBe(`${total}px`);
    expect(boxOf(fragment("North:center:0"))).toEqual(["72px", "30px"]);
    expect(sizer.style.height).toBe(rowsExtent);

    const pointer = { button: 0, pointerId: 3, pointerType: "mouse" } as const;
    const handle = one('.gp-grid-rows-wrapper [data-cell-row="2"] .gp-grid-row-resize-handle');
    await act(async () => {
      fireEvent.pointerDown(handle, { ...pointer, clientX: 30, clientY: 100 });
      fireEvent.pointerMove(document, { ...pointer, clientX: 30, clientY: 140 });
    });
    const lineY = gridRef.current?.core?.input.getDragState().rowResize?.lineY ?? Number.NaN;
    expect(one(".gp-grid-row-resize-line").style.top).toBe(`${total + lineY}px`);
    await act(async () => {
      fireEvent.pointerUp(document, { ...pointer, clientX: 30, clientY: 140 });
    });

    await act(async () => {
      fireEvent.pointerDown(leafHeader("x"), { ...pointer, clientX: 650, clientY: 150 });
      fireEvent.pointerMove(document, { ...pointer, clientX: 150, clientY: 150 });
    });
    expect(one(".gp-grid-column-drop-indicator").style.height).toBe(`${total}px`);
    expect(one(".gp-grid-column-move-ghost").style.height).toBe(`${total}px`);
    await act(async () => {
      fireEvent.pointerUp(document, { ...pointer, clientX: 150, clientY: 150 });
    });
  });

  it("places the loading overlay below a grouped header", async () => {
    const pending = createServerDataSource<Row>(() => new Promise(() => {}));
    render(<Grid {...gridProps({ current: null }, { columnGroups: prdFixture(), dataSource: pending })} />);
    await waitFor(() => expect(document.querySelector(".gp-grid-loading-overlay")).not.toBeNull());
    const overlay = one(".gp-grid-loading-overlay").parentElement;
    expect(overlay?.style.top).toBe(`${4 * HEADER_HEIGHT}px`);
  });
});
