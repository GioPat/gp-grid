// benchmarks/conformance/frozen-rows-runtime-helpers.ts
// Readers for the runtime and boundary frozen-row suites (PRD 005, Slice 3).
// Split out so `frozen-rows-helpers.ts` and every spec stay inside budget.

import { expect, type Locator, type Page } from "@playwright/test";
import { readHook, TOLERANCE } from "./helpers";
import {
  BLOCK_HEIGHT,
  blockBox,
  bodyMetrics,
  FROZEN_COUNT,
  frozenBlock,
  mountedRows,
  ROW_HEIGHT,
  scroller,
  type FrozenRowsView,
  type RowBox,
} from "./frozen-rows-helpers";

/** The fixture's default row overscan, from `resolveGridCoreConfig`. */
export const DEFAULT_OVERSCAN = 3;

/** C9 events the fixture recorded from `onFrozenRowsChanged`, in order. */
export const freezeEvents = (page: Page): Promise<FrozenRowsView[]> =>
  readHook<FrozenRowsView[]>(page, "freezeEvents");

/** Suffix row index -> its offset below the band's bottom edge. */
export const suffixOffsets = (rows: RowBox[], bandBottom: number): Map<number, number> =>
  new Map(rows.filter((row) => row.frozen === false).map((row) => [row.index, row.top - bandBottom]));

export const rowTop = (rows: RowBox[], index: number): number | undefined =>
  rows.find((row) => row.index === index)?.top;

export const firstSuffixIndex = (rows: RowBox[]): number => {
  const suffix = rows.filter((row) => row.frozen === false);
  if (suffix.length === 0) throw new Error("No mounted suffix row.");
  return Math.min(...suffix.map((row) => row.index));
};

/** Step 15's bound: the frozen prefix plus the overscanned suffix window. */
export const mountedRowBound = (clientHeight: number): number =>
  FROZEN_COUNT +
  Math.ceil((clientHeight - BLOCK_HEIGHT) / ROW_HEIGHT) +
  1 +
  2 * DEFAULT_OVERSCAN;

/** The band's box and its rows on the 0 / rowHeight grid, for any count. */
export const expectBand = async (page: Page, count: number): Promise<void> => {
  await expect(frozenBlock(page)).toHaveCount(1);
  // The core query a caller polls answers a frame before the wrapper commits
  // the block's box, so the box is retried rather than sampled once.
  await expect.poll(async () => {
    const box = await blockBox(page);
    const onGrid = Math.abs(box.top) <= TOLERANCE
      && Math.abs(box.height - count * ROW_HEIGHT) <= TOLERANCE;
    return onGrid ? "band on grid" : `top ${box.top} height ${box.height}`;
  }).toBe("band on grid");
  const rows = await mountedRows(page);
  const frozen = rows.filter((row) => row.frozen);
  expect(frozen.map((row) => row.index)).toEqual(
    Array.from({ length: count }, (_, index) => index),
  );
  for (const row of frozen) {
    expect(Math.abs(row.top - row.index * ROW_HEIGHT), `frozen row ${row.index} top`)
      .toBeLessThanOrEqual(TOLERANCE);
  }
};

export interface AriaCellView {
  /** 0-based logical row, from `data-cell-row`. */
  rowIndex: number;
  /** Rendered 1-based `aria-colindex`. */
  colIndex: number;
  /** 0-based displayed column the cell claims, from `data-cell-col`. */
  displayedIndex: number;
  /** Effective column region, from `data-cell-region`. */
  region: string | null;
  /** Whether the cell sits in the frozen pin layer rather than the block. */
  pinned: boolean;
}

export interface AriaRowView {
  /** Rendered 1-based `aria-rowindex`. */
  rowIndex: number;
  /** `role="row"` elements carrying it inside the grid. */
  elements: number;
  /** Of those, the ones inside `.gp-grid-frozen-pins`. */
  pinned: number;
}

export interface GridAriaView {
  role: string | null;
  colCount: number;
  rowCount: number;
  rows: AriaRowView[];
  /** `role="row"` elements in the pin layer, which carry no logical index. */
  pinLayerRows: number;
  cells: AriaCellView[];
  /** Every rendered text node outside `.gp-grid-visually-hidden`. */
  visibleText: string;
}

/** One snapshot of the grid's ARIA surface, for step 18's assertions. */
export const gridAria = (page: Page): Promise<GridAriaView> =>
  page.locator(".gp-grid-container").evaluate((container) => {
    const pinLayer = container.querySelector(".gp-grid-frozen-pins");
    const readVisibleText = (root: Element): string => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const parts: string[] = [];
      let node = walker.nextNode();
      while (node !== null) {
        const parent = (node as Text).parentElement;
        if (parent?.closest(".gp-grid-visually-hidden") === null) parts.push(node.textContent ?? "");
        node = walker.nextNode();
      }
      return parts.join(" ").replace(/\s+/g, " ").trim();
    };
    const groups = new Map<number, { rowIndex: number; elements: number; pinned: number }>();
    for (const row of Array.from(container.querySelectorAll<HTMLElement>('[role="row"][aria-rowindex]'))) {
      const rowIndex = Number(row.getAttribute("aria-rowindex"));
      const group = groups.get(rowIndex) ?? { rowIndex, elements: 0, pinned: 0 };
      group.elements += 1;
      if (pinLayer?.contains(row) === true) group.pinned += 1;
      groups.set(rowIndex, group);
    }
    const cells = Array.from(container.querySelectorAll<HTMLElement>('[role="gridcell"]')).map((cell) => ({
      rowIndex: Number(cell.getAttribute("data-cell-row")),
      colIndex: Number(cell.getAttribute("aria-colindex")),
      displayedIndex: Number(cell.getAttribute("data-cell-col")),
      region: cell.getAttribute("data-cell-region"),
      pinned: pinLayer?.contains(cell) ?? false,
    }));
    return {
      role: container.getAttribute("role"),
      colCount: Number(container.getAttribute("aria-colcount")),
      rowCount: Number(container.getAttribute("aria-rowcount")),
      rows: Array.from(groups.values()),
      pinLayerRows: pinLayer?.querySelectorAll('[role="row"]').length ?? 0,
      cells,
      visibleText: readVisibleText(container),
    };
  });

/** The `gp-grid-*` class tokens of the header's shipped controls, sorted. */
export const headerControlTokens = (page: Page): Promise<string[]> =>
  page.locator(".gp-grid-header").evaluate((header) => {
    const controls = "button, .gp-grid-header-resize-handle, .gp-grid-sort-arrows, .gp-grid-filter-icon";
    const tokens = new Set<string>();
    for (const element of Array.from(header.querySelectorAll<HTMLElement>(controls))) {
      for (const token of Array.from(element.classList)) {
        if (token.startsWith("gp-grid-")) tokens.add(token);
      }
    }
    return Array.from(tokens).sort();
  });

/** `data-cell-col` values of one frozen row's center cells inside the block. */
export const frozenCenterColumns = (page: Page, rowIndex: number): Promise<number[]> =>
  page
    .locator(`.gp-grid-frozen-rows [data-cell-row="${rowIndex}"][data-cell-col]`)
    .evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute("data-cell-col"))));

/** The frozen rows' rendered 1-based `aria-rowindex` values, in DOM order. */
export const frozenAriaRowIndices = (page: Page): Promise<number[]> =>
  page
    .locator(".gp-grid-frozen-rows .gp-grid-row")
    .evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("aria-rowindex"))));

export interface RelativeBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A locator's box relative to the scroller's client area. */
export const relativeBox = async (page: Page, locator: Locator): Promise<RelativeBox> => {
  const box = await locator.boundingBox();
  const origin = await scroller(page).boundingBox();
  if (box === null || origin === null) throw new Error("Element is not measurable.");
  return {
    top: box.y - origin.y,
    bottom: box.y + box.height - origin.y,
    left: box.x - origin.x,
    right: box.x + box.width - origin.x,
  };
};

/** Scroll to a DOM top, tolerating the browser's scroll rounding. */
export const scrollNear = async (page: Page, top: number): Promise<void> => {
  await expect.poll(async () => (await bodyMetrics(page)).maxScroll).toBeGreaterThanOrEqual(top);
  await scroller(page).evaluate((element, target) => {
    element.scrollTo({ top: target, left: 0 });
    element.dispatchEvent(new Event("scroll"));
  }, top);
  await expect.poll(async () => Math.abs((await bodyMetrics(page)).scrollTop - top))
    .toBeLessThanOrEqual(2);
};

/**
 * The `rtl.spec.ts` synthetic touch swipe, started on the frozen band. The
 * first move is absorbed by the tap slop, so the second one carries `dy`.
 */
export const swipeBand = async (page: Page, dy: number): Promise<void> => {
  const box = await frozenBlock(page).boundingBox();
  if (box === null) throw new Error("Frozen block is not measurable.");
  await frozenBlock(page).evaluate(async (element, args) => {
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const send = (type: string, y: number): void => {
      const touches = [{ identifier: 1, clientX: args.x, clientY: y }];
      element.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
          touches,
          changedTouches: touches,
        }),
      );
    };
    const start = args.startY;
    send("touchstart", start);
    send("touchmove", start - args.slop);
    await frame();
    send("touchmove", start - args.slop - args.dy);
    await frame();
    await frame();
    send("touchcancel", start - args.slop - args.dy);
    await frame();
  }, { x: box.x + box.width / 2, startY: box.y + box.height - 4, slop: 20, dy });
};

/**
 * Press a row's drag handle and hold the pointer over the band, sampling the
 * scroll top while the C11 auto-scroll loop runs.
 */
export const dragOverBand = async (
  page: Page,
  rowIndex: number,
  holdMs: number,
): Promise<number[]> => {
  const handle = page.locator(`.gp-grid-cell--row-drag-handle[data-cell-row="${rowIndex}"]`);
  const handleBox = await handle.boundingBox();
  const band = await frozenBlock(page).boundingBox();
  if (handleBox === null || band === null) throw new Error("Row drag handle is not measurable.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    band.x + band.width / 2,
    band.y + band.height / 2,
    { steps: 5 },
  );
  const samples: number[] = [];
  const sampleCount = 6;
  for (let index = 0; index < sampleCount; index += 1) {
    await page.waitForTimeout(holdMs / sampleCount);
    samples.push((await bodyMetrics(page)).scrollTop);
  }
  await page.mouse.up();
  return samples;
};
