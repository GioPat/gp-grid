// benchmarks/conformance/server-groups-helpers.ts
// Fixture vocabulary for the server grouping suite (PRD 009): arming, the mock
// service's request log, the mounted loading rows and the view rows by index.

import { expect, type Page } from "@playwright/test";
import { headerRowCount, openFixture, readHook } from "./helpers";
import { scroller } from "./frozen-rows-helpers";
import { viewRows, type ViewRowSnapshot } from "./row-groups-helpers";

/** The fixture's `cache.pageSize`, with no prefetch. */
export const PAGE_SIZE = 50;
export const CITIES_PER_COUNTRY = 100;
export const LEAVES_PER_CITY = 100;
/** `scroll-deep` brings this view row into view. */
export const DEEP_ROW = 5_000;
export const FIRST_COUNTRY = "Country 0";
/** `GridRowGroupLabels.loadFailed`'s default. */
export const LOAD_FAILED = "Loading failed. Expand again to retry.";

export type ServerGroupsArm = "immediate" | "held" | "frozen";

const ARM_TEST_IDS: Record<ServerGroupsArm, string> = {
  immediate: "use-server-groups",
  held: "use-server-groups-held",
  frozen: "use-server-groups-frozen",
};

export type PathStep = [dimension: string, tag: string, key: string | number | boolean | null];

export interface ServerRequest {
  kind: "children" | "leaves";
  path: PathStep[];
  range: { startRow: number; endRow: number };
  aborted: boolean;
}

export interface MountedRowState {
  index: number;
  frozen: boolean;
  loading: boolean;
  cells: number;
}

export const countryStep = (country: string): PathStep => ["country", "s", country];
export const cityStep = (city: string): PathStep => ["city", "s", city];

export const serverRequests = (page: Page): Promise<ServerRequest[]> =>
  readHook<ServerRequest[]>(page, "serverRequests");

export const rowGroupsState = (page: Page): Promise<{ expanded: unknown[]; collapsed: unknown[] } | null> =>
  readHook(page, "rowGroupsState");

/** The loaded view row at a view index; a placeholder has none. */
export const viewRowAt = (rows: readonly ViewRowSnapshot[], index: number): ViewRowSnapshot | undefined =>
  rows.find((row) => row.index === index);

/** View index of a city group row under a country, or -1 while either is not loaded. */
export const cityIndex = (rows: readonly ViewRowSnapshot[], country: string, city: string): number => {
  const parent = rows.find((row) => row.kind === "group" && row.depth === 0 && row.value === country);
  if (parent === undefined) return -1;
  const found = rows.find((row) => row.index > parent.index && row.depth === 1 && row.value === city);
  return found?.index ?? -1;
};

/** Every mounted body row by view index, with whether it is a loading row and the cells it holds. */
export const mountedRowStates = async (page: Page): Promise<MountedRowState[]> =>
  scroller(page).evaluate((element, headerRows) => {
    const block = element.querySelector(".gp-grid-frozen-rows");
    return Array.from(element.querySelectorAll<HTMLElement>(".gp-grid-row[aria-rowindex]")).map((row) => ({
      index: Number(row.getAttribute("aria-rowindex")) - headerRows - 1,
      frozen: block !== null && block.contains(row),
      loading: row.classList.contains("gp-grid-row--loading"),
      cells: row.querySelectorAll(".gp-grid-cell").length,
    }));
  }, await headerRowCount(page));

/** Wait until every mounted row holds its loaded node. */
export const waitForLoaded = async (page: Page): Promise<void> => {
  await expect.poll(async () => (await mountedRowStates(page)).filter((row) => row.loading).length).toBe(0);
};

/** Arm a server group fixture and wait for its root rows; the held arm releases its root response first. */
export const armServerGroups = async (page: Page, framework: string, arm: ServerGroupsArm): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId(ARM_TEST_IDS[arm]).click();
  if (arm === "held") {
    await expect.poll(async () => (await serverRequests(page)).length).toBe(1);
    await page.getByTestId("release-responses").click();
  }
  await expect.poll(async () => viewRowAt(await viewRows(page), 1)?.value ?? null).toBe(FIRST_COUNTRY);
  await expect(page.locator(".gp-grid-row").first()).toBeVisible();
  return pageErrors;
};
