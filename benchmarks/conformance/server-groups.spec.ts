// benchmarks/conformance/server-groups.spec.ts
// AC-009-01/03/05: a server-grouped grid asks the mock service only for what it
// shows, drops a late response, keeps a frozen prefix without the gap, retries
// a failed branch alone, and renders placeholders as loading rows.
// Runs in the react, vue and angular projects.

import { expect, test } from "@playwright/test";
import { TOLERANCE } from "./helpers";
import { bodyMetrics, frozenCell, rowRegions, waitForScroll } from "./frozen-rows-helpers";
import { boxAt, rowHeightAt } from "./row-heights-helpers";
import {
  expander,
  labelCell,
  ROW_HEIGHT,
  rowAt,
  TALL_HEIGHT,
  TALL_LEAF_ID,
  TOTAL_ID,
  viewRows,
} from "./row-groups-helpers";
import {
  armServerGroups,
  CITIES_PER_COUNTRY,
  cityIndex,
  cityStep,
  countryStep,
  DEEP_ROW,
  FIRST_COUNTRY,
  LEAVES_PER_CITY,
  LOAD_FAILED,
  mountedRowStates,
  PAGE_SIZE,
  rowGroupsState,
  serverRequests,
  viewRowAt,
  waitForLoaded,
  type ServerRequest,
} from "./server-groups-helpers";

const FIRST_PAGE = { startRow: 0, endRow: PAGE_SIZE };
const CITY_00 = [countryStep(FIRST_COUNTRY), cityStep("City 00")];

const request = (kind: ServerRequest["kind"], path: ServerRequest["path"], range = FIRST_PAGE): ServerRequest =>
  ({ kind, path, range, aborted: false });

test("AC-009-01 loads the root from one group request and a city from the leaf pages in view", async ({ page }, testInfo) => {
  const pageErrors = await armServerGroups(page, testInfo.project.name, "immediate");
  expect(await serverRequests(page)).toEqual([request("children", [])]);
  const roots = await viewRows(page);
  expect(roots.map((row) => row.kind)).toEqual(["total", ...Array<string>(10).fill("group")]);
  expect(roots[0]!.id).toBe(TOTAL_ID);

  await expander(page, 1).click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 2)?.value ?? null).toBe("City 00");
  expect((await serverRequests(page)).slice(1)).toEqual([request("children", [countryStep(FIRST_COUNTRY)])]);

  await expander(page, 2).click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 3)?.kind ?? null).toBe("record");
  await waitForLoaded(page);
  expect((await serverRequests(page)).slice(2)).toEqual([request("leaves", CITY_00)]);
  const shown = (await mountedRowStates(page)).filter((row) => row.index > 2 && row.index <= 2 + LEAVES_PER_CITY);
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.length).toBeLessThan(PAGE_SIZE);

  // Inside the city's second page: that page only, never the next city or the first page again.
  await waitForScroll(page, 60 * ROW_HEIGHT, 0);
  await expect.poll(async () => (await serverRequests(page)).length).toBe(4);
  await waitForLoaded(page);
  expect((await serverRequests(page)).slice(3)).toEqual([
    request("leaves", CITY_00, { startRow: PAGE_SIZE, endRow: 2 * PAGE_SIZE }),
  ]);
  expect(viewRowAt(await viewRows(page), 2 + LEAVES_PER_CITY)).toMatchObject({ kind: "record", depth: 2 });
  expect(pageErrors).toEqual([]);
});

test("AC-009-03 a collapse before the response arrives drops it and aborts its request", async ({ page }, testInfo) => {
  const pageErrors = await armServerGroups(page, testInfo.project.name, "held");
  const roots = await viewRows(page);

  await expander(page, 1).click();
  await expect.poll(async () => (await serverRequests(page)).length).toBe(2);
  // While the cities are held, every mounted row under the country is a loading row with no cells.
  await expect.poll(async () => (await mountedRowStates(page)).filter((row) => row.loading).length)
    .toBeGreaterThan(0);
  const mounted = await mountedRowStates(page);
  const placeholders = mounted.filter((row) => row.index >= 2 && row.index < 2 + CITIES_PER_COUNTRY);
  expect(placeholders).toEqual(mounted.filter((row) => row.loading));
  expect(placeholders.every((row) => row.cells === 0)).toBe(true);
  expect(placeholders).toHaveLength(mounted.length - 2);
  const viewportRows = Math.floor((await bodyMetrics(page)).clientHeight / ROW_HEIGHT);
  expect(placeholders.length).toBeGreaterThanOrEqual(viewportRows - 2);

  await page.getByTestId("collapse-first-group").click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 1)?.expanded ?? null).toBe(false);
  await page.getByTestId("release-responses").click();

  await expect.poll(async () => (await serverRequests(page))[1]?.aborted ?? null).toBe(true);
  await expect(page.locator(".gp-grid-row--loading")).toHaveCount(0);
  expect(await viewRows(page)).toEqual(roots);
  expect(await serverRequests(page)).toHaveLength(2);
  expect((await rowGroupsState(page))?.expanded).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("AC-009-05 a deep scroll under a frozen prefix loads the suffix pages and none between", async ({ page }, testInfo) => {
  const pageErrors = await armServerGroups(page, testInfo.project.name, "frozen");
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(2);
  // Every group opens as it loads: the frozen total and first country, then that country's first city's leaves.
  await expect.poll(async () => viewRowAt(await viewRows(page), 3)?.kind ?? null).toBe("record");
  await waitForLoaded(page);
  const startup = await serverRequests(page);
  expect(startup).toEqual([
    request("children", []),
    request("children", [countryStep(FIRST_COUNTRY)]),
    request("leaves", CITY_00),
  ]);

  await page.getByTestId("scroll-deep").click();
  await expect.poll(async () => (await mountedRowStates(page)).some((row) => row.index === DEEP_ROW)).toBe(true);
  await waitForLoaded(page);

  const log = await serverRequests(page);
  const fresh = log.slice(startup.length);
  expect(fresh.length).toBeGreaterThan(0);
  expect(log.filter((entry) => entry.path.length === 0)).toHaveLength(1);
  const rows = await viewRows(page);
  const suffix = (await mountedRowStates(page)).filter((row) => row.frozen === false).map((row) => row.index);
  const [first, last] = [Math.min(...suffix), Math.max(...suffix)];
  for (const entry of fresh) {
    expect(entry.kind).toBe("leaves");
    const [country, city] = entry.path.map((step) => String(step[2]));
    const leafStart = cityIndex(rows, country!, city!) + 1;
    expect(leafStart + entry.range.startRow, `${city} ${entry.range.startRow}`).toBeLessThanOrEqual(last);
    expect(leafStart + entry.range.endRow, `${city} ${entry.range.startRow}`).toBeGreaterThan(first);
  }
  await expect(frozenCell(page, 0, 0)).toContainText("Grand total");
  await expect(frozenCell(page, 1, 0)).toContainText(FIRST_COUNTRY);
  expect(pageErrors).toEqual([]);
});

test("AC-009-05 a failed city shows its error, keeps its sibling's rows and loads on a second expand", async ({ page }, testInfo) => {
  const pageErrors = await armServerGroups(page, testInfo.project.name, "immediate");
  await expander(page, 1).click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 3)?.value ?? null).toBe("City 01");
  await expander(page, 3).click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 4)?.kind ?? null).toBe("record");
  const sibling = (await viewRows(page)).filter((row) => row.kind === "record").map((row) => row.id);

  await page.getByTestId("fail-next-leaves").click();
  await expander(page, 2).click();

  const failed = await rowAt(page, 2);
  await expect(failed).toHaveClass(/gp-grid-row--error/);
  await expect(failed).toHaveAttribute("data-row-error", "true");
  await expect(labelCell(page, 2)).toHaveAttribute("title", LOAD_FAILED);
  const after = await viewRows(page);
  expect(viewRowAt(after, 2)).toMatchObject({ value: "City 00", expanded: false });
  expect(viewRowAt(after, 3)).toMatchObject({ value: "City 01", expanded: true });
  expect(after.filter((row) => row.kind === "record").map((row) => row.id)).toEqual(sibling);

  await expander(page, 2).click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 3)?.kind ?? null).toBe("record");
  await expect(failed).not.toHaveClass(/gp-grid-row--error/);
  await expect(failed).not.toHaveAttribute("data-row-error");
  await expect(labelCell(page, 2)).not.toHaveAttribute("title", LOAD_FAILED);
  expect((await serverRequests(page)).filter((entry) => entry.kind === "leaves").map((entry) => entry.path[1]![2]))
    .toEqual(["City 01", "City 00", "City 00"]);
  expect(pageErrors).toEqual([]);
});

test("a row height set on a loaded leaf survives a scroll away and back", async ({ page }, testInfo) => {
  const pageErrors = await armServerGroups(page, testInfo.project.name, "immediate");
  await expander(page, 1).click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 2)?.value ?? null).toBe("City 00");
  await expander(page, 2).click();
  await expect.poll(async () => viewRowAt(await viewRows(page), 3)?.id ?? null).toBe(TALL_LEAF_ID);

  await page.getByTestId("tall-leaf").click();
  await expect.poll(() => rowHeightAt(page, 3)).toBe(TALL_HEIGHT);

  await waitForScroll(page, 150 * ROW_HEIGHT, 0);
  await expect.poll(async () => (await mountedRowStates(page)).some((row) => row.index === 3)).toBe(false);
  await waitForScroll(page, 0, 0);
  await waitForLoaded(page);

  expect(viewRowAt(await viewRows(page), 3)?.id).toBe(TALL_LEAF_ID);
  await expect.poll(() => rowHeightAt(page, 3)).toBe(TALL_HEIGHT);
  await expect.poll(async () => Math.abs(((await boxAt(page, 3))?.height ?? 0) - TALL_HEIGHT))
    .toBeLessThanOrEqual(TOLERANCE);
  expect(pageErrors).toEqual([]);
});
