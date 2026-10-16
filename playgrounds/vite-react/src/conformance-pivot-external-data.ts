// playgrounds/vite-react/src/conformance-pivot-external-data.ts
// The precomputed pivot's literal values (PRD 012 AC-012-01). No imports: the
// conformance spec reads the same literals, and its ids are written by hand so
// a mismatch with the wrapper's encoders leaves a cell empty.

export type PivotLiteralTable = Readonly<Record<string, Readonly<Record<string, number | null>>>>;

export const PIVOT_LITERAL_TOTAL_ID = "gp-total";
export const PIVOT_LITERAL_LABEL_ID = "gp-pivot-label";

export const PIVOT_REGIONS = [
  { region: "North", cities: ["Oslo", "Bergen"] },
  { region: "South", cities: ["Rome"] },
] as const;

export const PIVOT_ROW_IDS = {
  total: PIVOT_LITERAL_TOTAL_ID,
  north: 'gp-group:[["region","s","North"]]',
  oslo: 'gp-group:[["region","s","North"],["city","s","Oslo"]]',
  bergen: 'gp-group:[["region","s","North"],["city","s","Bergen"]]',
  south: 'gp-group:[["region","s","South"]]',
  rome: 'gp-group:[["region","s","South"],["city","s","Rome"]]',
} as const;

/** Revision 1 leaf tuples `[year, quarter]`, revision 2 `[year]`, in column order. */
export const PIVOT_TUPLES_1 = [[2024, "Q1"], [2024, "Q2"], [2025, "Q1"], [2025, "Q2"], [2025, "Q3"]] as const;
export const PIVOT_TUPLES_2 = [[2024], [2025], [2026]] as const;

const year = (value: number): string => `["year","n",${value}]`;
const quarter = (value: string): string => `["quarter","s","${value}"]`;
const leaf = (path: string[], measure: "amount" | "count"): string => `gp-pivot:[${path.join(",")}]|${measure}`;

export const PIVOT_COLUMN_IDS = {
  q2024q1Amount: leaf([year(2024), quarter("Q1")], "amount"),
  q2024q1Count: leaf([year(2024), quarter("Q1")], "count"),
  q2024q2Amount: leaf([year(2024), quarter("Q2")], "amount"),
  q2024q2Count: leaf([year(2024), quarter("Q2")], "count"),
  q2025q1Amount: leaf([year(2025), quarter("Q1")], "amount"),
  q2025q1Count: leaf([year(2025), quarter("Q1")], "count"),
  q2025q2Amount: leaf([year(2025), quarter("Q2")], "amount"),
  q2025q2Count: leaf([year(2025), quarter("Q2")], "count"),
  q2025q3Amount: leaf([year(2025), quarter("Q3")], "amount"),
  q2025q3Count: leaf([year(2025), quarter("Q3")], "count"),
  y2024Amount: leaf([year(2024)], "amount"),
  y2024Count: leaf([year(2024)], "count"),
  y2025Amount: leaf([year(2025)], "amount"),
  y2025Count: leaf([year(2025)], "count"),
  y2026Amount: leaf([year(2026)], "amount"),
  y2026Count: leaf([year(2026)], "count"),
  totalAmount: leaf([], "amount"),
  totalCount: leaf([], "count"),
} as const;

export const PIVOT_GROUP_IDS = {
  y2024: `gp-pivot-group:[${year(2024)}]`,
  y2025: `gp-pivot-group:[${year(2025)}]`,
  y2026: `gp-pivot-group:[${year(2026)}]`,
  totals: "gp-pivot-group:[]",
} as const;

const ids = PIVOT_COLUMN_IDS;

/** Revision 1 columns in schema order, label excluded. */
export const PIVOT_COLUMNS_1 = [
  ids.q2024q1Amount, ids.q2024q1Count, ids.q2024q2Amount, ids.q2024q2Count,
  ids.q2025q1Amount, ids.q2025q1Count, ids.q2025q2Amount, ids.q2025q2Count,
  ids.q2025q3Amount, ids.q2025q3Count, ids.totalAmount, ids.totalCount,
] as const;

export const PIVOT_COLUMNS_2 = [
  ids.y2024Amount, ids.y2024Count, ids.y2025Amount, ids.y2025Count,
  ids.y2026Amount, ids.y2026Count, ids.totalAmount, ids.totalCount,
] as const;

const tableOf = (
  columns: readonly string[],
  rows: Readonly<Record<string, readonly (number | null)[]>>,
): PivotLiteralTable =>
  Object.fromEntries(Object.entries(rows).map(([rowId, values]) =>
    [rowId, Object.fromEntries(columns.map((columnId, index) => [columnId, values[index] ?? null]))]));

const rows = PIVOT_ROW_IDS;

/** `null` is an intersection without records. */
export const PIVOT_VALUES_1: PivotLiteralTable = tableOf(PIVOT_COLUMNS_1, {
  [rows.total]: [15, 2, 32, 3, 63, 4, 40, 1, 65, 3, 215, 13],
  [rows.north]: [15, 2, 20, 2, 55, 3, 40, 1, 15, 1, 145, 9],
  [rows.oslo]: [10, 1, 20, 2, 30, 1, null, null, 15, 1, 75, 5],
  [rows.bergen]: [5, 1, null, null, 25, 2, 40, 1, null, null, 70, 4],
  [rows.south]: [null, null, 12, 1, 8, 1, null, null, 50, 2, 70, 4],
  [rows.rome]: [null, null, 12, 1, 8, 1, null, null, 50, 2, 70, 4],
});

/** Revision 1 by year, plus the 2026 records. */
export const PIVOT_VALUES_2: PivotLiteralTable = tableOf(PIVOT_COLUMNS_2, {
  [rows.total]: [47, 5, 168, 8, 50, 3, 265, 16],
  [rows.north]: [35, 4, 110, 5, 20, 1, 165, 10],
  [rows.oslo]: [30, 3, 45, 2, 20, 1, 95, 6],
  [rows.bergen]: [5, 1, 65, 3, null, null, 70, 4],
  [rows.south]: [12, 1, 58, 3, 30, 2, 100, 6],
  [rows.rome]: [12, 1, 58, 3, 30, 2, 100, 6],
});

export const PIVOT_WIDE_KEY_COUNT = 1000;
