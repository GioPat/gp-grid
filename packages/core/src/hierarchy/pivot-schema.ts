// packages/core/src/hierarchy/pivot-schema.ts
// The columns and header groups of a pivot over its ordered leaf tuples (PRD 012 D2).

import type {
  ColumnDefinition,
  ColumnGroupChild,
  GroupPathStep,
  PivotMeasure,
  PivotSchema,
  PivotSchemaOptions,
} from "../types";
import { PIVOT_LABEL_COLUMN_ID, encodePivotColumnId, encodePivotGroupId } from "./pivot-ids";

interface OpenGroup {
  groupId: string;
  headerName: string;
  children: ColumnGroupChild[];
}

const LABEL_FIXED = { colId: PIVOT_LABEL_COLUMN_ID, field: PIVOT_LABEL_COLUMN_ID, filterable: false };
const LABEL_DEFAULTS: ColumnDefinition = { ...LABEL_FIXED, headerName: "", width: 200, cellDataType: "text" };

/** Dates print in UTC, so a schema is the same on the server and in every time zone. */
const formatTimestamp = (key: GroupPathStep[2]): string => {
  const time = Number(key);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : String(key);
};

const defaultFormatKey = ([, tag, key]: GroupPathStep): string => {
  if (tag === "z") return "(Blanks)";
  if (tag === "d") return formatTimestamp(key);
  return String(key);
};

const invalid = (reason: string): RangeError => new RangeError(`Invalid pivot keys: ${reason}`);

const checkTuple = (tuple: readonly GroupPathStep[], index: number, first: readonly GroupPathStep[]): void => {
  if (tuple.length !== first.length) {
    throw invalid(`tuple ${index} has ${tuple.length} steps, expected ${first.length}`);
  }
  for (const [level, step] of tuple.entries()) {
    const expected = first[level]![0];
    if (step[0] !== expected) throw invalid(`tuple ${index} level ${level} is "${step[0]}", expected "${expected}"`);
  }
};

const checkKeys = (keys: readonly (readonly GroupPathStep[])[]): void => {
  const first = keys[0];
  if (first === undefined) return;
  if (first.length === 0) throw invalid("tuple 0 is empty");
  for (const [index, tuple] of keys.entries()) checkTuple(tuple, index, first);
};

const sameStep = (a: GroupPathStep, b: GroupPathStep): boolean =>
  a[0] === b[0] && a[1] === b[1] && Object.is(a[2], b[2]);

const sharedLength = (a: readonly GroupPathStep[], b: readonly GroupPathStep[]): number => {
  let length = 0;
  while (length < a.length && length < b.length && sameStep(a[length]!, b[length]!)) length += 1;
  return length;
};

const measureColumn = (path: readonly GroupPathStep[], measure: PivotMeasure): ColumnDefinition => {
  const colId = encodePivotColumnId(path, measure.field);
  const fixed = { colId, field: colId, editable: false, filterable: false };
  return { headerName: measure.field, cellDataType: "number", width: 120, ...measure.column, ...fixed };
};

interface SchemaBuild {
  readonly options: PivotSchemaOptions;
  readonly formatKey: (step: GroupPathStep) => string;
  readonly columns: ColumnDefinition[];
  readonly roots: ColumnGroupChild[];
  /** The groups of the previous tuple's prefixes, outermost first. */
  readonly open: OpenGroup[];
  /** Every group id built so far: a prefix must stay contiguous. */
  readonly seen: Set<string>;
}

const appendMeasures = (build: SchemaBuild, path: readonly GroupPathStep[], into: ColumnGroupChild[]): void => {
  for (const measure of build.options.measures) {
    const column = measureColumn(path, measure);
    build.columns.push(column);
    into.push(column.colId!);
  }
};

const openGroup = (build: SchemaBuild, prefix: readonly GroupPathStep[], index: number): OpenGroup => {
  const groupId = encodePivotGroupId(prefix);
  if (build.seen.has(groupId)) throw invalid(`tuple ${index} repeats an earlier prefix`);
  build.seen.add(groupId);
  return { groupId, headerName: build.formatKey(prefix.at(-1)!), children: [] };
};

const appendTuple = (build: SchemaBuild, keys: readonly (readonly GroupPathStep[])[], index: number) => {
  const { open } = build;
  const tuple = keys[index]!;
  open.length = sharedLength(keys[index - 1] ?? [], tuple);
  if (open.length === tuple.length) throw invalid(`tuple ${index} repeats an earlier prefix`);
  while (open.length < tuple.length) {
    const group = openGroup(build, tuple.slice(0, open.length + 1), index);
    (open.at(-1)?.children ?? build.roots).push(group);
    open.push(group);
  }
  appendMeasures(build, tuple, open.at(-1)?.children ?? build.roots);
};

/** `keys` are the leaf tuples in column order, all over the same pivot dimensions. */
export const buildPivotSchema = (
  keys: readonly (readonly GroupPathStep[])[],
  options: PivotSchemaOptions,
): PivotSchema => {
  checkKeys(keys);
  const label: ColumnDefinition = { ...LABEL_DEFAULTS, ...options.labelColumn, ...LABEL_FIXED };
  const build: SchemaBuild = {
    options,
    formatKey: options.formatKey ?? defaultFormatKey,
    columns: [label],
    roots: [PIVOT_LABEL_COLUMN_ID],
    open: [],
    seen: new Set(),
  };
  for (const index of keys.keys()) appendTuple(build, keys, index);
  if (options.rowTotals) {
    const totals: OpenGroup = { groupId: encodePivotGroupId([]), headerName: options.rowTotalsHeader ?? "Total", children: [] };
    appendMeasures(build, [], totals.children);
    build.roots.push(totals);
  }
  return { columns: build.columns, columnGroups: build.roots };
};
