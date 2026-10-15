// Random sales with mixed keys and the naive grouping the mock grouping service is checked against.

import { keyOf, keyTagOf } from "../src/hierarchy/keys";
import { compareValues } from "../src/indexed-data-store/sorting";
import { compareTagged } from "../src/hierarchy/group-order";
import type {
  CellValue,
  ColumnFilterModel,
  DataSourceRange,
  GroupPathStep,
  ServerGroupChildrenRequest,
  ServerGroupingSpec,
  ServerGroupNode,
  ServerLeavesRequest,
  SortModel,
} from "../src/types";
import { seededRandom } from "./row-grouping-source";

export type Sale = { id: number } & Record<string, CellValue | undefined>;
export type Path = readonly GroupPathStep[];

export const TAG_NAMES = ["z", "s", "n", "b", "d"] as const;
const DIMENSIONS: ServerGroupingSpec["dimensions"] = [{ field: "region" }, { field: "team", id: "t" }];
export const GROUPING: ServerGroupingSpec = {
  dimensions: DIMENSIONS,
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "score", aggregate: "avg" },
    { field: "scored", source: "score", aggregate: "count" },
    { field: "low", source: "amount", aggregate: "min" },
    { field: "high", source: "amount", aggregate: "max" },
  ],
};
const ALL: DataSourceRange = { startRow: 0, endRow: 1000 };

const pick = <T>(random: () => number, pool: readonly T[]): T => pool[Math.floor(random() * pool.length)]!;

export const makeSales = (seed: number, count: number): Sale[] => {
  const random = seededRandom(seed);
  const regions = ["north", "South", "", 3, 10, "10", true, false, null, undefined, new Date(5000), new Date(1000)];
  const teams = ["a", "b", 2, 0, false, null, undefined, new Date(0)];
  const amounts = [1, 2.5, -3, 0, 40, null, undefined];
  const scores = [1, 7, 3.5, null, NaN, "x"];
  return Array.from({ length: count }, (_, id) => ({
    id,
    region: pick(random, regions),
    team: pick(random, teams),
    amount: pick(random, amounts),
    score: pick(random, scores),
  }));
};

const stepAt = (row: Sale, level: number): GroupPathStep => {
  const dimension = DIMENSIONS[level]!;
  const value = row[dimension.field];
  const tag = keyTagOf(value);
  return [dimension.id ?? dimension.field, TAG_NAMES[tag]!, keyOf(value, tag)];
};

const sameStep = (a: GroupPathStep, b: GroupPathStep) => JSON.stringify(a) === JSON.stringify(b);

export const inPath = (rows: readonly Sale[], path: Path) =>
  rows.filter((row) => path.every((step, level) => sameStep(stepAt(row, level), step)));

const compareSteps = (a: GroupPathStep, b: GroupPathStep) =>
  compareTagged(TAG_NAMES.indexOf(a[1]), a[2], TAG_NAMES.indexOf(b[1]), b[2]);

/** The child steps under `path`, in the local engine's key order. */
export const naiveSteps = (rows: readonly Sale[], path: Path, direction: 1 | -1 = 1): GroupPathStep[] => {
  const steps = new Map<string, GroupPathStep>();
  for (const row of inPath(rows, path)) {
    const step = stepAt(row, path.length);
    steps.set(JSON.stringify(step), step);
  }
  return [...steps.values()].sort((a, b) => direction * compareSteps(a, b));
};

const finite = (values: unknown[]) =>
  values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

const orNull = (numbers: number[], result: () => number) => (numbers.length === 0 ? null : result());

export const naiveAggregates = (rows: readonly Sale[]) => {
  const amounts = finite(rows.map((row) => row.amount));
  const scores = rows.map((row) => row.score);
  const numericScores = finite(scores);
  return {
    amount: orNull(amounts, () => amounts.reduce((a, b) => a + b, 0)),
    score: orNull(numericScores, () => numericScores.reduce((a, b) => a + b, 0) / numericScores.length),
    scored: scores.filter((value) => value !== null && value !== undefined).length,
    low: orNull(amounts, () => Math.min(...amounts)),
    high: orNull(amounts, () => Math.max(...amounts)),
  };
};

export const naiveChildren = (rows: readonly Sale[], path: Path, direction: 1 | -1 = 1): ServerGroupNode[] =>
  naiveSteps(rows, path, direction).map((step) => {
    const childPath = [...path, step];
    const members = inPath(rows, childPath);
    const terminal = childPath.length === DIMENSIONS.length;
    return {
      key: step[1] === "d" ? new Date(step[2] as number) : step[2],
      childCount: terminal ? members.length : naiveSteps(rows, childPath).length,
      leafCount: members.length,
      aggregates: naiveAggregates(members),
    };
  });

const compareBy = (sort: readonly SortModel[]) => (a: Sale, b: Sale) => {
  for (const { colId, direction } of sort) {
    const comparison = compareValues(a[colId] ?? null, b[colId] ?? null);
    if (comparison !== 0) return direction === "desc" ? -comparison : comparison;
  }
  return 0;
};

export const naiveLeaves = (rows: readonly Sale[], path: Path, sort: readonly SortModel[] = []) =>
  inPath(rows, path).sort(compareBy(sort));

export const terminalPaths = (rows: readonly Sale[]): Path[] =>
  naiveSteps(rows, []).flatMap((root) => naiveSteps(rows, [root]).map((team) => [root, team]));

export const childrenRequest = (
  path: Path,
  extra: Partial<ServerGroupChildrenRequest> = {},
): ServerGroupChildrenRequest => ({ revision: null, grouping: GROUPING, path, range: ALL, ...extra });

export const leavesRequest = (path: Path, extra: Partial<ServerLeavesRequest> = {}): ServerLeavesRequest => ({
  revision: 1,
  grouping: GROUPING,
  path,
  range: ALL,
  ...extra,
});

export const valuesFilter = (values: CellValue[], includeBlank: boolean): ColumnFilterModel => ({
  combination: "and",
  groups: [
    {
      combination: "and",
      conditions: [{ type: "text", operator: "contains", selectedValues: new Set(values), includeBlank }],
    },
  ],
});
