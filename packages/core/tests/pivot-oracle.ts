// Seeded sales and a reference pivot that filters the rows directly, for the pivot engine oracles.

import { compareTagged } from "../src/hierarchy/group-order";
import { encodeGroupId } from "../src/hierarchy/group-path";
import { TAG_NAMES, keyOf, keyTagOf } from "../src/hierarchy/keys";
import { PIVOT_LABEL_COLUMN_ID, decodePivotColumnId, encodePivotColumnId } from "../src/hierarchy/pivot-ids";
import type { CellValue, GroupPathStep, RowGroupAggregator, SortModel } from "../src/types";
import { seededRandom } from "./row-grouping-source";

export interface OracleRow {
  [field: string]: CellValue;
  id: number;
  region: string | null;
  city: string;
  year: number;
  quarter: string;
  amount: number | null;
  score: number | null;
}

type Path = readonly GroupPathStep[];
export type Reduce = (values: readonly CellValue[]) => CellValue;

export interface OracleMeasure {
  readonly field: string;
  readonly source: string;
  readonly reduce: Reduce;
}

export interface ReferenceRow {
  readonly id: string;
  readonly values: CellValue[];
}

export interface ReferenceTable {
  readonly columns: string[];
  readonly rows: ReferenceRow[];
}

export const ORACLE_FIELDS = ["id", "region", "city", "year", "quarter", "amount", "score"];
const REGIONS = ["North", "South", "East", "West", null];
const YEARS = [2022, 2023, 2024];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const ROW_DIMENSIONS = ["region", "city"];

const pick = <T>(random: () => number, pool: readonly T[]): T => pool[Math.floor(random() * pool.length)]!;

export const makeOracleRows = (seed: number): OracleRow[] => {
  const random = seededRandom(seed);
  const count = 50 + Math.floor(random() * 251);
  return Array.from({ length: count }, (_, id) => {
    const region = pick(random, REGIONS);
    return {
      id,
      region,
      city: `${region ?? "none"}-${Math.floor(random() * 3)}`,
      year: pick(random, YEARS),
      quarter: pick(random, QUARTERS),
      amount: random() < 0.15 ? null : Math.floor(random() * 150) - 50,
      score: random() < 0.1 ? null : random() * 10,
    };
  });
};

const finite = (values: readonly CellValue[]): number[] =>
  values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

const unlessEmpty = (numbers: number[], result: () => number): CellValue => (numbers.length === 0 ? null : result());

export const REDUCERS = {
  sum: (values) => unlessEmpty(finite(values), () => finite(values).reduce((a, b) => a + b, 0)),
  count: (values) => values.filter((value) => value !== null).length,
  avg: (values) => unlessEmpty(finite(values), () => finite(values).reduce((a, b) => a + b, 0) / finite(values).length),
  min: (values) => unlessEmpty(finite(values), () => Math.min(...finite(values))),
  max: (values) => unlessEmpty(finite(values), () => Math.max(...finite(values))),
  spread: (values) => unlessEmpty(finite(values), () => Math.max(...finite(values)) - Math.min(...finite(values))),
} satisfies Record<string, Reduce>;

interface Spread {
  low: number;
  high: number;
  count: number;
}

/** The range of the finite values, the custom aggregator the oracles run with and without `merge`. */
export const spreadAggregator = (withMerge: boolean): RowGroupAggregator<Spread> => {
  const aggregator: RowGroupAggregator<Spread> = {
    init: () => ({ low: Infinity, high: -Infinity, count: 0 }),
    add: (state, value) => {
      if (typeof value !== "number" || Number.isFinite(value) === false) return state;
      return { low: Math.min(state.low, value), high: Math.max(state.high, value), count: state.count + 1 };
    },
    result: (state) => (state.count === 0 ? null : state.high - state.low),
  };
  if (withMerge === false) return aggregator;
  return {
    ...aggregator,
    merge: (into, from) => ({
      low: Math.min(into.low, from.low),
      high: Math.max(into.high, from.high),
      count: into.count + from.count,
    }),
  };
};

const stepOf = (dimension: string, value: CellValue): GroupPathStep => {
  const tag = keyTagOf(value);
  return [dimension, TAG_NAMES[tag]!, keyOf(value, tag)];
};

const compareSteps = (a: GroupPathStep, b: GroupPathStep): number =>
  compareTagged(TAG_NAMES.indexOf(a[1]), a[2], TAG_NAMES.indexOf(b[1]), b[2]);

const compareCells = (a: CellValue, b: CellValue): number => compareTagged(keyTagOf(a), a, keyTagOf(b), b);

const sameKey = (row: OracleRow, step: GroupPathStep): boolean =>
  JSON.stringify(stepOf(step[0], row[step[0]] ?? null)) === JSON.stringify(step);

const inPath = (rows: readonly OracleRow[], path: Path): OracleRow[] =>
  rows.filter((row) => path.every((step) => sameKey(row, step)));

const distinctSteps = (rows: readonly OracleRow[], dimension: string): GroupPathStep[] => {
  const steps = new Map<string, GroupPathStep>();
  for (const row of rows) {
    const step = stepOf(dimension, row[dimension] ?? null);
    steps.set(JSON.stringify(step), step);
  }
  return [...steps.values()].sort(compareSteps);
};

/** Leaf tuples over `year > quarter`: the pairs present, or every year present by the domain's quarters. */
export const referenceTuples = (rows: readonly OracleRow[], domain?: readonly string[]): Path[] => {
  const years = distinctSteps(rows, "year");
  if (domain !== undefined) {
    const quarters = [...new Set(domain)].map((quarter) => stepOf("quarter", quarter));
    return years.flatMap((year) => quarters.map((quarter) => [year, quarter]));
  }
  return years.flatMap((year) => distinctSteps(inPath(rows, [year]), "quarter").map((quarter) => [year, quarter]));
};

const valueOf = (members: readonly OracleRow[], measures: readonly OracleMeasure[], columnId: string): CellValue => {
  const decoded = decodePivotColumnId(columnId)!;
  const measure = measures.find((candidate) => candidate.field === decoded.measure)!;
  const cell = inPath(members, decoded.path);
  if (cell.length === 0) return null;
  return measure.reduce(cell.map((row) => row[measure.source] ?? null));
};

/** Siblings by key, by key in the sort's direction for the label column, or by a column's value with ties by key. */
const siblingOrder = (sort: SortModel | undefined, measures: readonly OracleMeasure[], rows: readonly OracleRow[], path: Path) => {
  const sign = sort?.direction === "desc" ? -1 : 1;
  if (sort === undefined) return compareSteps;
  if (sort.colId === PIVOT_LABEL_COLUMN_ID) return (a: GroupPathStep, b: GroupPathStep) => sign * compareSteps(a, b);
  const value = (step: GroupPathStep) => valueOf(inPath(rows, [...path, step]), measures, sort.colId);
  return (a: GroupPathStep, b: GroupPathStep) => sign * compareCells(value(a), value(b)) || compareSteps(a, b);
};

export interface ReferenceSpec {
  readonly measures: readonly OracleMeasure[];
  readonly domain?: readonly string[];
  readonly sort?: SortModel;
}

/** The grand total row, then every group in pre-order, each with every generated and row-total column. */
export const referencePivot = (rows: readonly OracleRow[], spec: ReferenceSpec): ReferenceTable => {
  const tuples = referenceTuples(rows, spec.domain);
  const columns = [
    ...tuples.flatMap((tuple) => spec.measures.map((measure) => encodePivotColumnId(tuple, measure.field))),
    ...spec.measures.map((measure) => encodePivotColumnId([], measure.field)),
  ];
  const rowOf = (id: string, members: readonly OracleRow[]): ReferenceRow => ({
    id,
    values: columns.map((column) => valueOf(members, spec.measures, column)),
  });
  const table: ReferenceRow[] = [rowOf("gp-total", rows)];
  const emit = (path: Path) => {
    const members = inPath(rows, path);
    const dimension = ROW_DIMENSIONS[path.length]!;
    const steps = distinctSteps(members, dimension).sort(siblingOrder(spec.sort, spec.measures, rows, path));
    for (const step of steps) {
      const child = [...path, step];
      table.push(rowOf(encodeGroupId(child), inPath(rows, child)));
      if (child.length < ROW_DIMENSIONS.length) emit(child);
    }
  };
  emit([]);
  return { columns, rows: table };
};
