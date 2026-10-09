// benchmarks/conformance/auto-fit-helpers.ts
// Fixture vocabulary for the fit suite (PRD 007): arming, the fit hooks, the
// row and cell readers and the intrinsic-size sampler.

import { expect, type Locator, type Page } from "@playwright/test";
import { cell, headerCell, openFixture, readHook, TOLERANCE } from "./helpers";
import { scroller } from "./frozen-rows-helpers";

/** Slice 1 recipe: 32 px rows, 36 px header, fixed widths. */
export const ROW_HEIGHT = 32;
/** `autoFit` defaults: columns up to 600 px, rows in `[rowHeight, 10 × rowHeight]`. */
export const MAX_COLUMN_WIDTH = 600;
export const MAX_ROW_HEIGHT = 10 * ROW_HEIGHT;
/** A column without `minWidth` fits no narrower than this. */
export const MIN_COLUMN_WIDTH = 50;
export const NAME_MAX_WIDTH = 300;
export const COLUMN_IDS = [
  "id", "name", "notes", "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "summary",
] as const;
/** Layout indexes, in definition order. */
export const ID = 0;
export const NAME = 1;
export const NOTES = 2;
export const C0 = 3;
export const SUMMARY = 11;
export const layoutIndexOf = (columnId: string): number =>
  COLUMN_IDS.findIndex((id) => id === columnId);

export type AutoFitArm = "object" | "paged";

const ARM_TEST_IDS: Record<AutoFitArm, string> = {
  object: "use-auto-fit",
  paged: "use-auto-fit-paged",
};

export interface FitEventCounts {
  resized: number;
  moved: number;
  dragged: number;
  pinned: number;
  rowResized: number;
}

export type FitClamp = "min" | "max" | null;

export interface ColumnFitResult {
  status: string;
  scope: "rendered";
  consideredRows: number;
  columns: { columnId: string; width: number; clamped: FitClamp }[];
  skipped: { columnId: string; reason: string }[];
}

export interface RowFitResult {
  status: string;
  consideredColumns: number;
  rows: { rowId: number | string; height: number; clamped: FitClamp }[];
  skipped: { rowId: number | string; reason: string }[];
}

export const grid = (page: Page): Locator => page.locator('[role="grid"]');

/** The row edge handle inside one cell of the row; every cell carries one. */
export const rowHandle = (page: Page, row: number, layoutIndex = ID): Locator =>
  cell(page, row, layoutIndex).locator(".gp-grid-row-resize-handle");

export const columnHandle = (page: Page, layoutIndex: number): Locator =>
  headerCell(page, layoutIndex).locator(".gp-grid-header-resize-handle");

/** The drag preview, positioned against the grid root beside the column line. */
export const rowResizeLine = (page: Page): Locator =>
  page.locator('[role="grid"] .gp-grid-row-resize-line');

export const armAutoFit = async (
  page: Page,
  framework: string,
  arm: AutoFitArm = "object",
): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId(ARM_TEST_IDS[arm]).click();
  await expect.poll(() => readHook<string[]>(page, "columnIds")).toEqual([...COLUMN_IDS]);
  await expect(cell(page, 0, NOTES)).toContainText("lorem ipsum");
  return pageErrors;
};

const callHook = <T>(page: Page, name: string, args: unknown[]): Promise<T> =>
  page.evaluate(
    ({ hookName, hookArgs }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: Record<string, (...values: unknown[]) => unknown>;
      }).__gpConformance;
      return hooks?.[hookName]?.(...hookArgs) ?? null;
    },
    { hookName: name, hookArgs: args },
  ) as Promise<T>;

/** Omitted ids fit every mounted displayed column. */
export const fitColumns = (page: Page, columnIds?: string[]): Promise<ColumnFitResult> =>
  callHook<ColumnFitResult>(page, "fitColumns", columnIds === undefined ? [] : [columnIds]);

/** Omitted ids fit every mounted row. */
export const fitRows = (page: Page, rowIds?: number[]): Promise<RowFitResult> =>
  callHook<RowFitResult>(page, "fitRows", rowIds === undefined ? [] : [rowIds]);

export const lastFitResult = (page: Page): Promise<ColumnFitResult | RowFitResult | null> =>
  readHook<ColumnFitResult | RowFitResult | null>(page, "lastFitResult");

/** `null` drops the pixel override. */
export const setColumnWidth = (page: Page, columnId: string, width: number | null): Promise<void> =>
  callHook<void>(page, "setColumnWidth", [columnId, width]);

/** The hook also counts row-group events, which these suites do not own. */
export const fitEventCounts = async (page: Page): Promise<FitEventCounts> => {
  const { resized, moved, dragged, pinned, rowResized } = await readHook<FitEventCounts>(page, "eventCounts");
  return { resized, moved, dragged, pinned, rowResized };
};

/** Displayed width of a column in the core layout, `-1` when not displayed. */
export const layoutWidth = async (page: Page, columnId: string): Promise<number> => {
  const columns = await readHook<{ columnId: string; width: number }[]>(page, "layoutColumns");
  return columns.find((column) => column.columnId === columnId)?.width ?? -1;
};

/** The header box follows the core width, so the wrapper rendered the fit. */
export const waitForColumnWidth = async (
  page: Page,
  layoutIndex: number,
  width: number,
): Promise<void> => {
  const header = headerCell(page, layoutIndex);
  await expect(header).toHaveCount(1);
  await expect.poll(async () => {
    const box = await header.boundingBox();
    return box === null ? Number.POSITIVE_INFINITY : Math.abs(box.width - width);
  }).toBeLessThanOrEqual(TOLERANCE);
};

export interface IntrinsicSample {
  headers: { col: number; width: number }[];
  cells: { row: number; col: number; width: number; height: number }[];
}

/**
 * Per mounted header and non-editing body cell, its intrinsic width and
 * height read as D2 reads them: the dimension takes `max-content` or `auto`,
 * every box is read, and the previous inline value is put back.
 */
export const sampleIntrinsic = (page: Page): Promise<IntrinsicSample> =>
  grid(page).evaluate((root) => {
    type Dimension = "width" | "height";
    const intrinsic: Record<Dimension, string> = { width: "max-content", height: "auto" };
    const measure = (elements: HTMLElement[], dimension: Dimension): number[] => {
      const saved = elements.map((element) => ({
        element,
        value: element.style.getPropertyValue(dimension),
        priority: element.style.getPropertyPriority(dimension),
        hadAttribute: element.hasAttribute("style"),
      }));
      for (const element of elements) {
        element.style.setProperty(dimension, intrinsic[dimension], "important");
      }
      const sizes = elements.map((element) => element.getBoundingClientRect()[dimension]);
      for (const entry of saved) {
        if (entry.value === "") entry.element.style.removeProperty(dimension);
        else entry.element.style.setProperty(dimension, entry.value, entry.priority);
        if (entry.hadAttribute === false) entry.element.removeAttribute("style");
      }
      return sizes;
    };
    const headers = Array.from(root.querySelectorAll<HTMLElement>("[data-col-index]"));
    const cells = Array.from(
      root.querySelectorAll<HTMLElement>("[data-cell-row]:not(.gp-grid-cell--editing)"),
    );
    const headerWidths = measure(headers, "width");
    const cellWidths = measure(cells, "width");
    const cellHeights = measure(cells, "height");
    return {
      headers: headers.map((element, index) => ({
        col: Number(element.dataset.colIndex),
        width: headerWidths[index] ?? 0,
      })),
      cells: cells.map((element, index) => ({
        row: Number(element.dataset.cellRow),
        col: Number(element.dataset.cellCol),
        width: cellWidths[index] ?? 0,
        height: cellHeights[index] ?? 0,
      })),
    };
  });

export const widestInColumn = (sample: IntrinsicSample, layoutIndex: number): number =>
  Math.max(
    ...sample.headers.filter((entry) => entry.col === layoutIndex).map((entry) => entry.width),
    ...sample.cells.filter((entry) => entry.col === layoutIndex).map((entry) => entry.width),
  );

export const tallestInRow = (sample: IntrinsicSample, row: number): number =>
  Math.max(...sample.cells.filter((entry) => entry.row === row).map((entry) => entry.height));

/** Distinct mounted rows holding a body cell of the column. */
export const mountedRowCount = (sample: IntrinsicSample, layoutIndex: number): number =>
  new Set(sample.cells.filter((entry) => entry.col === layoutIndex).map((entry) => entry.row)).size;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface CellBox {
  row: number;
  col: number;
  frozen: boolean;
  top: number;
  height: number;
}

/** Every mounted body cell, relative to the scroller's client area. */
export const cellBoxes = (page: Page): Promise<CellBox[]> =>
  scroller(page).evaluate((element) => {
    const origin = element.getBoundingClientRect().top + element.clientTop;
    return Array.from(element.querySelectorAll<HTMLElement>("[data-cell-row]")).map((node) => {
      const box = node.getBoundingClientRect();
      return {
        row: Number(node.dataset.cellRow),
        col: Number(node.dataset.cellCol),
        frozen: node.closest(".gp-grid-frozen-rows, .gp-grid-frozen-pins") !== null,
        top: box.top - origin,
        height: box.height,
      };
    });
  });

/** Every cell of a row, pinned ones included, shares the first cell's box. */
const expectOnRowBox = (row: CellBox, cells: CellBox[]): void => {
  const columns = new Set(cells.map((entry) => entry.col));
  expect(columns.has(ID) && columns.has(SUMMARY), `row ${row.row} has both pins`).toBe(true);
  for (const entry of cells) {
    expect(Math.abs(entry.top - row.top), `row ${row.row} col ${entry.col} top`)
      .toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(entry.height - row.height), `row ${row.row} col ${entry.col} height`)
      .toBeLessThanOrEqual(TOLERANCE);
  }
};

/**
 * Mounted rows are contiguous within their region, and each row's cells,
 * under both pins, sit on one box (AC-007-01).
 */
export const expectContiguousRows = async (page: Page): Promise<CellBox[]> => {
  const boxes = await cellBoxes(page);
  const byRow = new Map<number, CellBox[]>();
  for (const box of boxes) byRow.set(box.row, [...(byRow.get(box.row) ?? []), box]);
  const rows = [...byRow.values()].map((cells) => cells[0]!).sort((a, b) => a.row - b.row);
  expect(rows.length).toBeGreaterThan(0);
  for (const [position, row] of rows.entries()) {
    expectOnRowBox(row, byRow.get(row.row) ?? []);
    const next = rows[position + 1];
    if (next === undefined || next.row !== row.row + 1 || next.frozen !== row.frozen) continue;
    expect(Math.abs(next.top - (row.top + row.height)), `row ${next.row} follows row ${row.row}`)
      .toBeLessThanOrEqual(TOLERANCE);
  }
  return rows;
};

export interface StyleSnapshot {
  /** Statuses of the column fit and the row fit, when they ran. */
  statuses: string[];
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

/**
 * `style` attribute of every header and body cell, keyed by its indexes, read
 * before and after the optional fits in one task, so no render runs between.
 */
export const stylesAroundFits = (
  page: Page,
  fits?: { columns: string[]; rows: number[] },
): Promise<StyleSnapshot> =>
  grid(page).evaluate((root, ids) => {
    const read = (): Record<string, string | null> => {
      const styles: Record<string, string | null> = {};
      for (const node of Array.from(root.querySelectorAll<HTMLElement>("[data-col-index]"))) {
        styles[`header:${node.dataset.colIndex}`] = node.getAttribute("style");
      }
      for (const node of Array.from(root.querySelectorAll<HTMLElement>("[data-cell-row]"))) {
        styles[`cell:${node.dataset.cellRow}:${node.dataset.cellCol}`] = node.getAttribute("style");
      }
      return styles;
    };
    const hooks = (globalThis as unknown as {
      __gpConformance: {
        fitColumns: (columnIds: string[]) => { status: string } | null;
        fitRows: (rowIds: number[]) => { status: string } | null;
      };
    }).__gpConformance;
    const before = read();
    const statuses = ids === null
      ? []
      : [hooks.fitColumns(ids.columns)?.status ?? "", hooks.fitRows(ids.rows)?.status ?? ""];
    return { statuses, before, after: read() };
  }, fits ?? null);

export const nodeCount = (page: Page): Promise<number> =>
  page.evaluate(() => document.getElementsByTagName("*").length);

/** Node count once two consecutive polls agree. */
export const settledNodeCount = async (page: Page): Promise<number> => {
  let previous = -1;
  await expect.poll(async () => {
    const count = await nodeCount(page);
    const settled = count === previous;
    previous = count;
    return settled;
  }).toBe(true);
  return previous;
};

export const generation = async (page: Page): Promise<number> => {
  const metrics = await page.getByTestId("metrics").textContent();
  return (JSON.parse(metrics ?? "{}") as { generation?: number }).generation ?? -1;
};

/** Class list of the focused element, `""` for the document body. */
export const focusedClass = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active === null || active === document.body ? "" : active.className.toString();
  });

/** Wait two frames, so a render the last command scheduled has landed. */
export const nextFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
