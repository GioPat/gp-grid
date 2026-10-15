// benchmarks/conformance/pivot-helpers.ts
// Fixture vocabulary for the pivot suite (PRD 012): arming, the hook readers
// and the precomputed fixture's literals, read from the fixture's own data file.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { columnIds, openFixture, readHook } from "./helpers";
import { indexOfId, viewRows, type ViewRowSnapshot } from "./row-groups-helpers";
import {
  PIVOT_COLUMNS_1,
  PIVOT_COLUMNS_2,
  PIVOT_LITERAL_LABEL_ID,
  type PivotLiteralTable,
} from "../../playgrounds/vite-react/src/conformance-pivot-external-data";

export {
  PIVOT_COLUMN_IDS,
  PIVOT_COLUMNS_1,
  PIVOT_COLUMNS_2,
  PIVOT_GROUP_IDS,
  PIVOT_ROW_IDS,
  PIVOT_VALUES_1,
  PIVOT_VALUES_2,
  PIVOT_WIDE_KEY_COUNT,
} from "../../playgrounds/vite-react/src/conformance-pivot-external-data";

export const LABEL_ID = PIVOT_LITERAL_LABEL_ID;
/** The label column leads the schema. */
export const LABEL = 0;
export const BAND_HEIGHT = 32;
export const COLUMNS_1 = [LABEL_ID, ...PIVOT_COLUMNS_1];
export const COLUMNS_2 = [LABEL_ID, ...PIVOT_COLUMNS_2];

export type PivotArm = "external" | "wide";

const ARM_TEST_IDS: Record<PivotArm, string> = {
  external: "use-pivot-external",
  wide: "use-pivot-external-wide",
};

export const pivotRevision = (page: Page): Promise<number | null> => readHook<number | null>(page, "pivotRevision");

/** Arm a pivot fixture and wait for its schema and first rows. */
export const armPivot = async (page: Page, framework: string, arm: PivotArm): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId(ARM_TEST_IDS[arm]).click();
  await expect.poll(async () => (await columnIds(page))[0] ?? null).toBe(LABEL_ID);
  await expect.poll(async () => (await viewRows(page))[0]?.kind ?? null).toBe("total");
  await expect(page.locator(".gp-grid-row").first()).toBeVisible();
  return pageErrors;
};

export const layoutIndexOf = async (page: Page, columnId: string): Promise<number> =>
  (await columnIds(page)).indexOf(columnId);

/** The literals of the rows in `rowIds`, as `viewRows` reports them. */
export const expectedValues = (table: PivotLiteralTable, rowIds: readonly string[], columns: readonly string[]) =>
  rowIds.map((id) => ({ id, values: Object.fromEntries(columns.map((column) => [column, table[id]?.[column] ?? null])) }));

export const shownValues = (rows: readonly ViewRowSnapshot[], rowIds: readonly string[], columns: readonly string[]) =>
  rowIds.map((id) => {
    const row = rows[indexOfId(rows, id)];
    return { id, values: Object.fromEntries(columns.map((column) => [column, row?.values[column] ?? null])) };
  });

/** Every listed row shows its literals in every listed column. */
export const expectLiterals = async (
  page: Page,
  table: PivotLiteralTable,
  rowIds: readonly string[],
  columns: readonly string[],
): Promise<void> => {
  await expect.poll(async () => shownValues(await viewRows(page), rowIds, columns))
    .toEqual(expectedValues(table, rowIds, columns));
};

export const cellText = (value: number | null | undefined): string => (value == null ? "" : String(value));

/** Text of a pivot fixture module as one app ships it. */
export const pivotFixtureSource = (framework: string, file: string): string => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../playgrounds");
  const folders: Record<string, string> = {
    react: "vite-react/src",
    vue: "vite-vue/src",
    angular: "angular/src/app",
  };
  return readFileSync(path.join(root, folders[framework]!, file), "utf8");
};
