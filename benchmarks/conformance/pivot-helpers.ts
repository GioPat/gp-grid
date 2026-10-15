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

// The engine arm (`use-pivot`): the record rule the playgrounds use, written
// again here so the expectations never come from the code under test.

export interface EngineRecord {
  id: number;
  country?: string | null;
  city: string;
  year: number;
  quarter: string;
  amount: number;
}

const ENGINE_RECORD_COUNT = 1000;
const ENGINE_COUNTRIES: readonly (string | null)[] = ["IT", "FR", "", null];

export const engineRecords = (): EngineRecord[] =>
  Array.from({ length: ENGINE_RECORD_COUNT }, (_, index) => {
    const record: EngineRecord = {
      id: index,
      city: `City ${index % 3}`,
      year: 2023 + (index % 3),
      quarter: `Q${(index % 4) + 1}`,
      amount: (index % 7) + 1,
    };
    if (index % 5 < ENGINE_COUNTRIES.length) record.country = ENGINE_COUNTRIES[index % 5];
    return record;
  });

/** `pivot-add-key` commits this record. */
export const ENGINE_ADDED_RECORD: Omit<EngineRecord, "id"> = { country: "IT", city: "City 0", year: 2026, quarter: "Q1", amount: 5 };

export type EngineMeasure = "amount" | "count";
export const ENGINE_MEASURES: readonly EngineMeasure[] = ["amount", "count"];

export const engineColumnId = (year: number, quarter: string, measure: EngineMeasure): string =>
  `gp-pivot:[["year","n",${year}],["quarter","s","${quarter}"]]|${measure}`;
export const engineTotalId = (measure: EngineMeasure): string => `gp-pivot:[]|${measure}`;
export const engineYearGroupId = (year: number): string => `gp-pivot-group:[["year","n",${year}]]`;
export const engineQuarterGroupId = (year: number, quarter: string): string =>
  `gp-pivot-group:[["year","n",${year}],["quarter","s","${quarter}"]]`;

/** Leaf tuples `[year, quarter]` in column order: years, then quarters, ascending. */
export const engineTuples = (records: readonly EngineRecord[]): [number, string][] => {
  const keys = new Set(records.map((record) => `${record.year}|${record.quarter}`));
  return [...keys]
    .map((key): [number, string] => {
      const [year, quarter] = key.split("|");
      return [Number(year), quarter!];
    })
    .sort(([yearA, quarterA], [yearB, quarterB]) => yearA - yearB || quarterA.localeCompare(quarterB));
};

/** Every generated column id, row totals last, as the engine lays them out after the label column. */
export const engineColumnIds = (records: readonly EngineRecord[]): string[] => [
  ...engineTuples(records).flatMap(([year, quarter]) => ENGINE_MEASURES.map((measure) => engineColumnId(year, quarter, measure))),
  ...ENGINE_MEASURES.map(engineTotalId),
];

/** `null` and a missing country share one bucket; `""` keeps its own. */
export const engineCountryOf = (record: EngineRecord): string | null => record.country ?? null;

const fold = (records: readonly EngineRecord[], measure: EngineMeasure): number | null => {
  if (records.length === 0) return null;
  return measure === "count" ? records.length : records.reduce((sum, record) => sum + record.amount, 0);
};

/** Expected generated cells of the records in one row: a sum and a count per tuple, then the row totals. */
export const engineExpectedRow = (records: readonly EngineRecord[], tuples: readonly [number, string][]) => {
  const values: Record<string, number | null> = {};
  for (const [year, quarter] of tuples) {
    const inTuple = records.filter((record) => record.year === year && record.quarter === quarter);
    for (const measure of ENGINE_MEASURES) values[engineColumnId(year, quarter, measure)] = fold(inTuple, measure);
  }
  for (const measure of ENGINE_MEASURES) values[engineTotalId(measure)] = fold(records, measure);
  return values;
};

export const engineRowsOf = (records: readonly EngineRecord[], country: string | null): EngineRecord[] =>
  records.filter((record) => engineCountryOf(record) === country);

/** Arm the engine pivot and wait for its schema and first rows. */
export const armEnginePivot = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId("use-pivot").click();
  await expect.poll(async () => (await columnIds(page))[0] ?? null).toBe(LABEL_ID);
  await expect.poll(async () => (await viewRows(page))[0]?.kind ?? null).toBe("total");
  await expect(page.locator(".gp-grid-row").first()).toBeVisible();
  return pageErrors;
};

export const pivotSchemaNotifications = (page: Page): Promise<number> => readHook<number>(page, "pivotSchemaNotifications");
