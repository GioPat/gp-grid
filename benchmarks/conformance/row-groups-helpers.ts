// benchmarks/conformance/row-groups-helpers.ts
// Fixture vocabulary for the row grouping suites (PRD 008): arming, the hook
// readers, the row and label probes and the aggregate oracle.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";
import { cell, headerRowCount, openFixture, readHook } from "./helpers";

export const ROW_HEIGHT = 32;
export const ROW_COUNT = 1000;
export const TALL_LEAF_ID = 0;
export const TALL_HEIGHT = 64;
export const TOTAL_ID = "gp-total";
export const EXTERNAL_TOTAL_ID = "ext:total";
export const EXTERNAL_GROUP_IDS = ["ext:north-a", "ext:north-b"] as const;
/** Layout indices of the engine arms' columns; `country` is the label column. */
export const COUNTRY = 0;
export const NAME = 2;
export const AMOUNT = 3;
export const SCORE = 4;
/** The external arm's `amount`; `region` is its label column. */
export const EXTERNAL_AMOUNT = 2;

export type RowGroupsArm = "object" | "columnar" | "external" | "paged";

const ARM_TEST_IDS: Record<RowGroupsArm, string> = {
  object: "use-row-groups",
  columnar: "use-row-groups-columnar",
  external: "use-row-groups-external",
  paged: "use-row-groups-paged",
};

export interface ViewRowSnapshot {
  index: number;
  kind: "record" | "group" | "total";
  id: string | number;
  depth: number;
  expanded: boolean | null;
  value: unknown;
  leafCount: number | null;
  values: Record<string, unknown>;
}

export interface RowGroupsRecord {
  id: number;
  country?: string | null;
  city: string;
  amount: number;
  score: number;
}

export interface RowGroupEvents {
  groupToggled: number;
  writeRejected: Record<string, number>;
}

export interface DomRow {
  index: number;
  kind: string | null;
  level: string | null;
  expanded: string | null;
  className: string;
}

const callHook = <T>(page: Page, name: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(
    ({ hookName, hookArgs }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: Record<string, (...values: unknown[]) => unknown>;
      }).__gpConformance;
      return hooks?.[hookName]?.(...hookArgs) ?? null;
    },
    { hookName: name, hookArgs: args },
  ) as Promise<T>;

export const viewRows = (page: Page): Promise<ViewRowSnapshot[]> =>
  readHook<ViewRowSnapshot[]>(page, "viewRows");

export const setExpanded = (
  page: Page,
  ids: readonly (string | number)[] | null,
  expanded: boolean,
): Promise<string | null> => callHook<string | null>(page, "setExpanded", ids, expanded);

export const lastGroupingRejection = (page: Page): Promise<{ reason: string; field?: string } | null> =>
  readHook(page, "lastGroupingRejection");

export const queryCount = (page: Page): Promise<number> => readHook<number>(page, "queryCount");

export const records = (page: Page): Promise<RowGroupsRecord[]> =>
  readHook<RowGroupsRecord[]>(page, "rowGroupsRecords");

export const rowGroupEvents = async (page: Page): Promise<RowGroupEvents> => {
  const counts = await readHook<RowGroupEvents>(page, "eventCounts");
  return { groupToggled: counts.groupToggled, writeRejected: counts.writeRejected };
};

/** Arm a row group fixture and wait for its first rows. */
export const armRowGroups = async (page: Page, framework: string, arm: RowGroupsArm): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId(ARM_TEST_IDS[arm]).click();
  if (arm === "paged") {
    await expect.poll(async () => (await lastGroupingRejection(page))?.reason ?? null).toBe("partial-source");
  } else {
    await expect.poll(async () => (await viewRows(page))[0]?.kind ?? null).toBe("total");
  }
  await expect(page.locator(".gp-grid-row").first()).toBeVisible();
  return pageErrors;
};

export const indexOfId = (rows: readonly ViewRowSnapshot[], id: string | number): number =>
  rows.findIndex((row) => row.id === id);

/** First group row with this key at this depth, after `from`. */
export const groupIndex = (
  rows: readonly ViewRowSnapshot[],
  value: unknown,
  depth = 0,
  from = 0,
): number =>
  rows.findIndex((row, index) =>
    index >= from && row.kind === "group" && row.depth === depth && row.value === value);

export const rowAt = async (page: Page, viewIndex: number): Promise<Locator> =>
  page.locator(`.gp-grid-row[aria-rowindex="${viewIndex + (await headerRowCount(page)) + 1}"]`);

export const labelCell = (page: Page, viewIndex: number): Locator => cell(page, viewIndex, COUNTRY);

export const expander = (page: Page, viewIndex: number, column = COUNTRY): Locator =>
  cell(page, viewIndex, column).locator(".gp-grid-group-toggle");

export const groupLabel = (page: Page, viewIndex: number, column = COUNTRY): Locator =>
  cell(page, viewIndex, column).locator(".gp-grid-group-label");

export const editor = (page: Page): Locator => page.locator(".gp-grid-edit-input");

export const container = (page: Page): Locator => page.locator(".gp-grid-container");

export const rootRole = (page: Page): Promise<string | null> =>
  page.locator('[role="grid"], [role="treegrid"]').first().getAttribute("role");

/** Every mounted row's hierarchy attributes, keyed by view index. */
export const domRows = async (page: Page): Promise<DomRow[]> =>
  page.locator(".gp-grid-body-scroll").evaluate((element, headerRows) =>
    Array.from(element.querySelectorAll<HTMLElement>(".gp-grid-row[aria-rowindex]")).map((row) => ({
      index: Number(row.getAttribute("aria-rowindex")) - headerRows - 1,
      kind: row.getAttribute("data-row-kind"),
      level: row.getAttribute("aria-level"),
      expanded: row.getAttribute("aria-expanded"),
      className: row.className,
    })), await headerRowCount(page));

/** Wait for a group's expansion as the hook reports it, and as its row does while mounted. */
export const waitForExpanded = async (page: Page, id: string | number, expanded: boolean): Promise<number> => {
  await expect.poll(async () => {
    const rows = await viewRows(page);
    return rows[indexOfId(rows, id)]?.expanded ?? null;
  }).toBe(expanded);
  const index = indexOfId(await viewRows(page), id);
  const row = await rowAt(page, index);
  if ((await row.count()) > 0) await expect(row).toHaveAttribute("aria-expanded", String(expanded));
  return index;
};

/** A paste the way a browser delivers one, to the focused grid. */
export const pasteText = (page: Page, text: string): Promise<void> =>
  page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);

/** D9 oracle: `sum` folds finite numbers only. */
export const sumOf = (values: readonly unknown[]): number | null => {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length === 0 ? null : numbers.reduce((sum, value) => sum + value, 0);
};

export const countryOf = (record: RowGroupsRecord): string | null => record.country ?? null;

/** Text of the external fixture module as one app ships it. */
export const externalFixtureSource = (framework: string): string => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../playgrounds");
  const folders: Record<string, string> = {
    react: "vite-react/src",
    vue: "vite-vue/src",
    angular: "angular/src/app",
  };
  return readFileSync(path.join(root, folders[framework]!, "conformance-row-groups-external.ts"), "utf8");
};
