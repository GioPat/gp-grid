// packages/react/tests/frozen-rows.test.tsx

import { describe, it, expect, afterEach } from "vitest";
import type { MutableRefObject } from "react";
import { render, act, waitFor, fireEvent } from "@testing-library/react";
import { createClientDataSource, createServerDataSource } from "@gp-grid/core";
import type { ColumnDefinition, FreezeRowsOptions, FrozenRowsState, GridInstruction } from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridProps, GridRef } from "../src/types";

interface TestRow {
  id: number;
  name: string;
  age: number;
  note: string;
}

const rows: TestRow[] = Array.from({ length: 100 }, (_, id) => ({
  id,
  name: `Name ${id}`,
  age: 20 + id,
  note: `Note ${id}`,
}));

// Start pin, two center columns, end pin; every column is editable so the
// fill handle has a target.
const columns: ColumnDefinition[] = [
  { colId: "id", field: "id", cellDataType: "number", width: 60, pinned: "start", editable: true },
  { colId: "name", field: "name", cellDataType: "text", width: 150, editable: true },
  { colId: "age", field: "age", cellDataType: "number", width: 80, editable: true },
  { colId: "note", field: "note", cellDataType: "text", width: 100, pinned: "end", editable: true },
];

const bodyScroll = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>(".gp-grid-body-scroll");
  if (element === null) throw new Error("body scroller is not mounted");
  return element;
};

const sizer = (): HTMLElement => bodyScroll().firstElementChild as HTMLElement;

const frozenBlock = (): HTMLElement | null => sizer().querySelector(".gp-grid-frozen-rows");

const frozenPins = (): HTMLElement | null => sizer().querySelector(".gp-grid-frozen-pins");

/** The grid's own rows wrapper, not the frozen block's inner copy. */
const suffixWrapper = (): HTMLElement => {
  const wrapper = Array.from(document.querySelectorAll<HTMLElement>(".gp-grid-rows-wrapper"))
    .find((candidate) => candidate.closest(".gp-grid-frozen-rows") === null);
  if (wrapper === undefined) throw new Error("suffix rows wrapper is not mounted");
  return wrapper;
};

const requireElement = <T extends Element>(element: T | null, name: string): T => {
  if (element === null) throw new Error(`${name} is not mounted`);
  return element;
};

const renderGrid = async (
  overrides: Partial<GridProps<TestRow>> = {},
): Promise<MutableRefObject<GridRef<TestRow> | null>> => {
  const gridRef: MutableRefObject<GridRef<TestRow> | null> = { current: null };
  render(
    <Grid
      columns={columns}
      dataSource={createClientDataSource(rows)}
      rowHeight={32}
      gridRef={gridRef}
      {...overrides}
    />,
  );
  await waitFor(() => {
    expect(document.querySelectorAll(".gp-grid-cell").length).toBeGreaterThan(0);
  });
  return gridRef;
};

/** Nonzero regions are reachable only through 2a's internal seam until step 19. */
const freeze = async (
  gridRef: MutableRefObject<GridRef<TestRow> | null>,
  requestedCount = 3,
): Promise<void> => {
  await act(async () => {
    gridRef.current?.core.setFrozenRowsRequest({ requestedCount });
  });
};

const unfreeze = async (
  gridRef: MutableRefObject<GridRef<TestRow> | null>,
): Promise<void> => {
  await act(async () => {
    gridRef.current?.core.setFrozenRowsRequest(null);
  });
};

/** Every recorded instruction of one type, across batches. */
const instructionsOfType = <TType extends GridInstruction["type"]>(
  batches: GridInstruction[][],
  type: TType,
): Extract<GridInstruction, { type: TType }>[] =>
  batches
    .flat()
    .filter(
      (instruction): instruction is Extract<GridInstruction, { type: TType }> =>
        instruction.type === type,
    );

/** A grid whose `freezeRows` prop can be rerendered, plus the batches and events it produced. */
const renderReactiveGrid = async (): Promise<{
  gridRef: MutableRefObject<GridRef<TestRow> | null>;
  freezeEvents: FrozenRowsState[];
  batches: GridInstruction[][];
  rerender: (freezeRows: FreezeRowsOptions | undefined) => void;
}> => {
  const gridRef: MutableRefObject<GridRef<TestRow> | null> = { current: null };
  const freezeEvents: FrozenRowsState[] = [];
  const batches: GridInstruction[][] = [];
  const element = (freezeRows: FreezeRowsOptions | undefined) => (
    <Grid
      columns={columns}
      rowData={rows}
      rowHeight={32}
      freezeRows={freezeRows}
      onFrozenRowsChanged={(state) => freezeEvents.push(state)}
      gridRef={gridRef}
    />
  );
  const { rerender } = render(element({ count: 3 }));
  await waitFor(() => {
    expect(document.querySelectorAll(".gp-grid-cell").length).toBeGreaterThan(0);
  });
  gridRef.current?.core.onBatchInstruction((batch) => batches.push([...batch]));
  freezeEvents.length = 0;
  return {
    gridRef,
    freezeEvents,
    batches,
    rerender: (freezeRows) => rerender(element(freezeRows)),
  };
};

/** Re-measure the body at `height` the way React's scroll/resize path does. */
const stubBodyHeight = async (height: number): Promise<void> => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => height,
  });
  await act(async () => {
    fireEvent.scroll(bodyScroll(), { target: { scrollTop: 0 } });
  });
};

afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
});

describe("frozen rows", () => {
  it("renders the block before the rows wrapper on the frozen-local grid", async () => {
    const gridRef = await renderGrid();
    await freeze(gridRef);

    const block = requireElement(frozenBlock(), "frozen block");
    expect(block.style.height).toBe("96px");

    const wrapper = suffixWrapper();
    const children = Array.from(sizer().children);
    expect(children.indexOf(block)).toBeLessThan(children.indexOf(wrapper));

    const frozenRows = Array.from(block.querySelectorAll<HTMLElement>(".gp-grid-row"));
    expect(frozenRows.map((row) => row.style.transform)).toEqual([
      "translateY(0px)",
      "translateY(32px)",
      "translateY(64px)",
    ]);
    expect(frozenRows.map((row) => row.getAttribute("aria-rowindex"))).toEqual(["1", "2", "3"]);

    // The suffix wrapper mounts rows from `frozenCount` on.
    const suffixRows = Array.from(wrapper.querySelectorAll<HTMLElement>(".gp-grid-row"));
    expect(suffixRows.length).toBeGreaterThan(0);
    for (const row of suffixRows) {
      expect(Number(row.getAttribute("aria-rowindex"))).toBeGreaterThan(3);
    }
  });

  it("keeps one element per frozen and pinned intersection", async () => {
    const gridRef = await renderGrid();
    await freeze(gridRef);

    const block = requireElement(frozenBlock(), "frozen block");
    const pins = requireElement(frozenPins(), "frozen pin layer");
    const frozenRows = block.querySelectorAll(".gp-grid-row");
    expect(frozenRows.length).toBe(3);

    // Block: center cells only.
    expect(block.querySelectorAll('[data-cell-region="center"]').length).toBe(6);
    expect(block.querySelectorAll('[data-cell-region="start"]').length).toBe(0);
    expect(block.querySelectorAll('[data-cell-region="end"]').length).toBe(0);

    // Pin layer: pinned cells only, one presentational row each.
    const pinRows = pins.querySelectorAll(".gp-grid-frozen-pin-row");
    expect(pinRows.length).toBe(3);
    expect(pinRows[0]?.getAttribute("role")).toBe("presentation");
    expect(pins.querySelectorAll('[data-cell-region="center"]').length).toBe(0);
    expect(pins.querySelectorAll('.gp-grid-pin--start [data-cell-region="start"]').length).toBe(3);
    expect(pins.querySelectorAll('.gp-grid-pin--end [data-cell-region="end"]').length).toBe(3);
    expect(pins.querySelectorAll('[role="row"]').length).toBe(0);

    for (let row = 0; row < 3; row++) {
      for (const col of [0, 1, 2, 3]) {
        const selector = `[data-cell-row="${row}"][data-cell-col="${col}"]`;
        expect(document.querySelectorAll(selector).length, `${selector} count`).toBe(1);
      }
      const ariaRow = `[aria-rowindex="${row + 1}"]`;
      expect(document.querySelectorAll(`.gp-grid-frozen-rows [role="row"]${ariaRow}`).length).toBe(1);
      expect(document.querySelectorAll(`${ariaRow}[role="row"]`).length).toBe(1);
    }
  });

  it("renders an unavailable frozen row as a placeholder without cells", async () => {
    const dataSource = createServerDataSource<TestRow>(async () => ({ rows: [], totalRows: 1000 }));
    const gridRef: MutableRefObject<GridRef<TestRow> | null> = { current: null };

    render(
      <Grid columns={columns} dataSource={dataSource} rowHeight={32} gridRef={gridRef} />,
    );
    await waitFor(() => {
      expect(gridRef.current?.core.rows.getCount()).toBe(1000);
    });
    await freeze(gridRef);

    const block = requireElement(frozenBlock(), "frozen block");
    const placeholders = Array.from(block.querySelectorAll<HTMLElement>(".gp-grid-row--loading"));
    expect(placeholders.length).toBe(3);
    expect(placeholders[0]?.getAttribute("role")).toBe("row");
    expect(placeholders[0]?.getAttribute("aria-rowindex")).toBe("1");
    expect(placeholders[0]?.style.transform).toBe("translateY(0px)");
    expect(placeholders[0]?.style.height).toBe("32px");
    expect(block.querySelectorAll(".gp-grid-cell").length).toBe(0);
    expect(requireElement(frozenPins(), "frozen pin layer").querySelectorAll(".gp-grid-frozen-pin-row").length).toBe(0);
  });

  it("places the fill handle in the frozen band for a frozen anchor", async () => {
    const gridRef = await renderGrid();
    await freeze(gridRef);

    await act(async () => {
      gridRef.current?.core.selection.startSelection({ row: 0, col: 1 }, {});
    });

    const centerHandle = requireElement(
      document.querySelector<HTMLElement>(".gp-grid-fill-handle"),
      "center fill handle",
    );
    expect(centerHandle.closest(".gp-grid-frozen-rows")).not.toBeNull();
    expect(centerHandle.closest(".gp-grid-frozen-pins")).toBeNull();
    expect(suffixWrapper().querySelector(".gp-grid-fill-handle")).toBeNull();
    expect(centerHandle.style.top).toBe("27px");

    // A frozen pinned anchor hosts the handle in the pin layer's sticky overlay.
    await act(async () => {
      gridRef.current?.core.selection.startSelection({ row: 1, col: 0 }, {});
    });

    const overlay = requireElement(
      document.querySelector<HTMLElement>(".gp-grid-frozen-pins .gp-grid-pin-overlay--start"),
      "frozen pin overlay",
    );
    const pinHandle = requireElement(
      overlay.querySelector<HTMLElement>(".gp-grid-fill-handle"),
      "pinned fill handle",
    );
    expect(pinHandle.style.top).toBe("59px");
    expect(document.querySelector(".gp-grid-frozen-pins .gp-grid-pin-overlay--end")).toBeNull();
  });

  it("places a frozen drop indicator inside the block", async () => {
    const dragColumns: ColumnDefinition[] = [
      { colId: "id", field: "id", cellDataType: "number", width: 60, rowDrag: true },
      { colId: "name", field: "name", cellDataType: "text", width: 150 },
      { colId: "age", field: "age", cellDataType: "number", width: 80 },
    ];
    const gridRef = await renderGrid({ columns: dragColumns });
    await freeze(gridRef);

    const handle = requireElement(
      document.querySelector<HTMLElement>('.gp-grid-frozen-rows [data-cell-row="0"][data-cell-col="0"]'),
      "frozen row drag handle",
    );
    await act(async () => {
      fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, button: 0, pointerId: 7 });
      fireEvent.pointerMove(document, { clientX: 10, clientY: 40, pointerId: 7 });
    });

    const indicator = requireElement(
      document.querySelector<HTMLElement>(".gp-grid-row-drop-indicator"),
      "row drop indicator",
    );
    expect(indicator.closest(".gp-grid-frozen-rows")).not.toBeNull();
    expect(indicator.style.transform).toBe("translateY(32px)");
    expect(suffixWrapper().querySelector(".gp-grid-row-drop-indicator")).toBeNull();

    await act(async () => {
      fireEvent.pointerUp(document, { clientX: 10, clientY: 40, pointerId: 7 });
    });
  });

  it("announces the frozen count when the limit changes", async () => {
    const gridRef = await renderGrid();
    const liveRegion = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="status"]');

    expect(liveRegion()).toBeNull();

    // Unlimited: nothing to announce.
    await freeze(gridRef);
    expect(liveRegion()).toBeNull();

    // A 64 px body cannot admit row 0 plus the 64 px minimum suffix.
    await stubBodyHeight(64);
    expect(frozenBlock()).toBeNull();
    expect(liveRegion()?.textContent).toBe("0 of 3 rows frozen");
    expect(liveRegion()?.getAttribute("aria-live")).toBe("polite");
    expect(liveRegion()?.classList.contains("gp-grid-visually-hidden")).toBe(true);

    await stubBodyHeight(600);
    expect(frozenBlock()).not.toBeNull();
    expect(liveRegion()?.textContent).toBe("3 of 3 rows frozen");
  });

  it("keeps the flat DOM without a freeze request", async () => {
    const gridRef = await renderGrid();

    expect(frozenBlock()).toBeNull();
    expect(frozenPins()).toBeNull();
    expect(document.querySelector('[role="status"]')).toBeNull();

    const wrapper = suffixWrapper();
    const suffixRows = Array.from(wrapper.querySelectorAll<HTMLElement>(".gp-grid-row"));
    expect(suffixRows.length).toBeGreaterThan(0);
    expect(suffixRows.map((row) => row.getAttribute("aria-rowindex"))).toEqual(
      suffixRows.map((_, index) => String(index + 1)),
    );
    expect(wrapper.querySelectorAll(".gp-grid-cell").length).toBe(
      document.querySelectorAll(".gp-grid-cell").length,
    );

    await freeze(gridRef);
    expect(frozenBlock()).not.toBeNull();

    await unfreeze(gridRef);
    expect(frozenBlock()).toBeNull();
    expect(frozenPins()).toBeNull();
    expect(document.querySelectorAll(".gp-grid-cell").length).toBe(
      suffixWrapper().querySelectorAll(".gp-grid-cell").length,
    );
  });

  it("applies a new freezeRows prop without recreating the core", async () => {
    const { gridRef, freezeEvents, rerender } = await renderReactiveGrid();
    const core = gridRef.current?.core;
    const scrollTop = bodyScroll().scrollTop;
    expect(requireElement(frozenBlock(), "frozen block").style.height).toBe("96px");

    rerender({ count: 5 });

    expect(gridRef.current?.core).toBe(core);
    expect(requireElement(frozenBlock(), "frozen block").style.height).toBe("160px");
    expect(gridRef.current?.core.frozenRows.get()).toEqual({
      requestedCount: 5,
      effectiveCount: 5,
      limit: null,
    });
    expect(freezeEvents).toEqual([{ requestedCount: 5, effectiveCount: 5, limit: null }]);
    expect(bodyScroll().scrollTop).toBe(scrollTop);
  });

  it("stays silent for an equal-valued freezeRows object", async () => {
    const { gridRef, freezeEvents, batches, rerender } = await renderReactiveGrid();

    await act(async () => {
      fireEvent.scroll(bodyScroll(), { target: { scrollTop: 200 } });
    });
    const emitted = batches.length;

    rerender({ count: 3 });

    expect(batches.length).toBe(emitted);
    expect(freezeEvents).toEqual([]);
    expect(gridRef.current?.core.frozenRows.get()).toEqual({
      requestedCount: 3,
      effectiveCount: 3,
      limit: null,
    });
    expect(bodyScroll().scrollTop).toBe(200);
  });

  it("corrects the scroll top and keeps the suffix anchor when the block grows", async () => {
    const { batches, rerender } = await renderReactiveGrid();

    await act(async () => {
      fireEvent.scroll(bodyScroll(), { target: { scrollTop: 200 } });
    });
    const anchorStart = instructionsOfType(batches, "UPDATE_VISIBLE_RANGE").at(-1)?.start;
    expect(anchorStart).toBe(9);

    batches.length = 0;
    rerender({ count: 4 });

    // happy-dom lays nothing out, so the anchor is asserted on the instructions.
    expect(instructionsOfType(batches, "SCROLL_TO").map((instruction) => instruction.scrollTop)).toEqual([168]);
    expect(instructionsOfType(batches, "UPDATE_VISIBLE_RANGE").at(-1)?.start).toBe(anchorStart);
    expect(bodyScroll().scrollTop).toBe(168);
  });

  it("restores the flat rows wrapper when freezeRows becomes undefined", async () => {
    const { rerender } = await renderReactiveGrid();
    expect(frozenBlock()).not.toBeNull();

    rerender(undefined);

    expect(frozenBlock()).toBeNull();
    expect(frozenPins()).toBeNull();
    expect(document.querySelectorAll(".gp-grid-cell").length).toBe(
      suffixWrapper().querySelectorAll(".gp-grid-cell").length,
    );
  });

  it("records no announcement for a default grid", async () => {
    const gridRef: MutableRefObject<GridRef<TestRow> | null> = { current: null };
    const batches: GridInstruction[][] = [];
    render(
      <Grid
        columns={columns}
        dataSource={createClientDataSource(rows)}
        rowHeight={32}
        gridRef={gridRef}
      />,
    );
    await waitFor(() => {
      expect(document.querySelectorAll(".gp-grid-cell").length).toBeGreaterThan(0);
    });

    gridRef.current?.core.onBatchInstruction((batch) => batches.push([...batch]));
    await act(async () => {
      gridRef.current?.core.setViewport(0, 0, 800, 560);
    });

    const instructions = batches.flat();
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.map((instruction) => instruction.type)).not.toContain("SET_ANNOUNCEMENT");
    for (const instruction of instructions) {
      if (instruction.type === "SET_ROW_REGIONS") {
        expect(instruction.regions.frozenCount).toBe(0);
      }
    }
  });
});
