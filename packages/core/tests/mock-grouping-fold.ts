// Keys, order, filter and aggregates of the mock grouping service, over in-memory records.

import type {
  CellValue,
  FilterCondition,
  FilterModel,
  GroupPathStep,
  ServerGroupingSpec,
  SortModel,
  TextFilterCondition,
} from "../src/types";

export type StepTag = GroupPathStep[1];
export type StepKey = GroupPathStep[2];
type Measure = ServerGroupingSpec["measures"][number];
type Fold = (values: readonly unknown[]) => CellValue;

export interface Bucket<TData> {
  tag: StepTag;
  key: StepKey;
  records: TData[];
}

// Number, date, boolean, string, then null last, as the local engine orders mixed keys.
const TAG_RANK: Record<StepTag, number> = { n: 0, d: 1, b: 2, s: 3, z: 4 };

export const readField = (record: unknown, field: string): unknown =>
  (record as Record<string, unknown>)[field];

const isEmpty = (value: unknown): boolean => value === null || value === undefined;

const tagOf = (value: unknown): StepTag => {
  if (isEmpty(value)) return "z";
  if (value instanceof Date) return "d";
  switch (typeof value) {
    case "string":
      return "s";
    case "number":
      return "n";
    case "boolean":
      return "b";
  }
  throw new RangeError(`Mock grouping cannot key ${JSON.stringify(value)}`);
};

const jsonNumber = (value: number): StepKey => (Number.isFinite(value) ? value : String(value));

/** The tag and key a path step carries for `value`; a date is keyed by its timestamp. */
export const stepKeyOf = (value: unknown): [StepTag, StepKey] => {
  const tag = tagOf(value);
  if (tag === "z") return [tag, null];
  if (tag === "d") return [tag, jsonNumber((value as Date).getTime())];
  // `+ 0` folds -0 into 0.
  if (tag === "n") return [tag, jsonNumber((value as number) + 0)];
  return [tag, value as string | boolean];
};

export const nodeKeyOf = (tag: StepTag, key: StepKey): CellValue => {
  if (tag === "d") return new Date(Number(key));
  if (tag === "n") return Number(key);
  return key;
};

const identityOf = (tag: StepTag, key: StepKey): string => `${tag}:${String(key)}`;

const recordIdentity = (record: unknown, field: string): string =>
  identityOf(...stepKeyOf(readField(record, field)));

/** A record field and the key a path step requires of it. */
export interface PathCriterion {
  field: string;
  identity: string;
}

export const criterionOf = (field: string, [, tag, key]: GroupPathStep): PathCriterion => ({
  field,
  identity: identityOf(tag, key),
});

export const matchesPath = (record: unknown, criteria: readonly PathCriterion[]): boolean =>
  criteria.every(({ field, identity }) => recordIdentity(record, field) === identity);

/** `compareValues` ordering: null last, numbers, dates and numeric strings by value, else text. */
export const compareCells = (a: unknown, b: unknown): number => {
  if (isEmpty(a) || isEmpty(b)) return Number(isEmpty(a)) - Number(isEmpty(b));
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return String(a).localeCompare(String(b));
  return x - y;
};

const compareBuckets = <TData>(a: Bucket<TData>, b: Bucket<TData>): number =>
  a.tag === b.tag ? compareCells(a.key, b.key) : TAG_RANK[a.tag] - TAG_RANK[b.tag];

export const groupRecords = <TData>(
  records: readonly TData[],
  field: string,
  descending: boolean,
): Bucket<TData>[] => {
  const buckets = new Map<string, Bucket<TData>>();
  for (const record of records) {
    const [tag, key] = stepKeyOf(readField(record, field));
    const identity = identityOf(tag, key);
    const bucket = buckets.get(identity) ?? { tag, key, records: [] };
    bucket.records.push(record);
    buckets.set(identity, bucket);
  }
  const direction = descending ? -1 : 1;
  return [...buckets.values()].sort((a, b) => direction * compareBuckets(a, b));
};

export const countKeys = (records: readonly unknown[], field: string): number =>
  new Set(records.map((record) => recordIdentity(record, field))).size;

const compareBySort = (a: unknown, b: unknown, sort: readonly SortModel[]): number => {
  for (const { colId, direction } of sort) {
    const comparison = compareCells(readField(a, colId), readField(b, colId));
    if (comparison !== 0) return direction === "desc" ? -comparison : comparison;
  }
  return 0;
};

export const sortRecords = <TData>(records: readonly TData[], sort: readonly SortModel[] = []): TData[] => {
  const active = sort.filter((entry) => entry.direction !== null);
  return [...records].sort((a, b) => compareBySort(a, b, active));
};

const valueIdentity = (value: unknown): string => {
  if (value instanceof Date) return `date:${value.getTime()}`;
  return `${typeof value}:${typeof value === "object" ? JSON.stringify(value) : String(value)}`;
};

const passesValues = (value: unknown, condition: TextFilterCondition): boolean => {
  const selected = condition.selectedValues;
  if (selected === undefined) return true;
  if (isEmpty(value) || value === "") return condition.includeBlank === true;
  const identity = valueIdentity(value);
  return [...selected].some((candidate) => valueIdentity(candidate) === identity);
};

const passesCondition = (value: unknown, condition: FilterCondition): boolean =>
  condition.type === "text" ? passesValues(value, condition) : true;

/** Values-mode conditions only, every one of them required; other conditions pass. */
export const passesFilter = (record: unknown, filter: FilterModel | undefined): boolean =>
  Object.entries(filter ?? {}).every(([field, model]) =>
    model.groups
      .flatMap((group) => group.conditions)
      .every((condition) => passesCondition(readField(record, field), condition)),
  );

const finiteOf = (values: readonly unknown[]): number[] =>
  values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

const totalOf = (numbers: readonly number[]): number => numbers.reduce((total, value) => total + value, 0);

const extremum =
  (sign: 1 | -1): Fold =>
  (values) => {
    let best: unknown = null;
    for (const value of values) {
      if (isEmpty(value)) continue;
      if (best === null || sign * compareCells(value, best) < 0) best = value;
    }
    return best as CellValue;
  };

const sum: Fold = (values) => {
  const numbers = finiteOf(values);
  return numbers.length === 0 ? null : totalOf(numbers);
};

const avg: Fold = (values) => {
  const numbers = finiteOf(values);
  return numbers.length === 0 ? null : totalOf(numbers) / numbers.length;
};

const FOLDS = new Map<string, Fold>([
  ["sum", sum],
  ["avg", avg],
  ["count", (values) => values.filter((value) => isEmpty(value) === false).length],
  ["min", extremum(1)],
  ["max", extremum(-1)],
]);

const foldOf = (name: string): Fold => {
  const fold = FOLDS.get(name);
  if (fold === undefined) throw new RangeError(`Mock grouping has no aggregate "${name}"`);
  return fold;
};

export const assertMeasures = (measures: readonly Measure[]): void => {
  for (const measure of measures) foldOf(measure.aggregate);
};

/** Aggregates keyed by measure field, each read from `source` when set. */
export const foldMeasures = (
  records: readonly unknown[],
  measures: readonly Measure[],
): Record<string, CellValue> =>
  Object.fromEntries(
    measures.map((measure) => {
      const values = records.map((record) => readField(record, measure.source ?? measure.field));
      return [measure.field, foldOf(measure.aggregate)(values)];
    }),
  );
