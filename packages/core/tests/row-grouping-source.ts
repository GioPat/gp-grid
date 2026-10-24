// FlatRowSource helpers for the engine tests: object rows and columnar arrays.

import type { CellValue, RowId, SortModel } from "../src/types";
import type { FlatRowSource } from "../src/types/row-grouping-engine";

type Row = Record<string, CellValue | undefined>;

interface SourceOptions {
  sort?: SortModel[];
  /** Column id -> field; a column id maps to itself when absent. */
  fieldMap?: Record<string, string>;
  /** Object rows: the field holding the row id; the flat position otherwise. */
  idField?: string;
}

const base = (rowCount: number, fields: string[], options: SourceOptions) => ({
  rowCount,
  sort: options.sort ?? [],
  fields,
  getRowId: (row: number) => row,
  fieldOf: (columnId: string) => options.fieldMap?.[columnId] ?? columnId,
});

export const objectSource = (rows: Row[], options: SourceOptions = {}): FlatRowSource => {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return {
    ...base(rows.length, fields, options),
    ...(options.idField && { getRowId: (row: number) => rows[row]![options.idField!] as RowId }),
    reader: (field) => (row) => rows[row]![field] as CellValue,
    getRecord: (row) => rows[row],
  };
};

export const columnarSource = (
  columns: Record<string, (CellValue | undefined)[]>,
  options: SourceOptions = {},
): FlatRowSource => {
  const fields = Object.keys(columns);
  const rowCount = columns[fields[0]!]?.length ?? 0;
  return {
    ...base(rowCount, fields, options),
    reader: (field) => {
      const column = columns[field] ?? [];
      return (row) => column[row] as CellValue;
    },
  };
};

export const toColumns = (rows: Row[], fields: string[]) =>
  Object.fromEntries(fields.map((field) => [field, rows.map((row) => row[field])]));

/** Deterministic PRNG so randomized cases are reproducible. */
export const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};
