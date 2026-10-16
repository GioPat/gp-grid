// packages/core/src/pivot/flat-response-source.ts
// The inner source's response as the flat rows the pivot reads (PRD 012 D4).

import { isColumnarDataSource, type DataSource, type DataSourceResponse, type PivotConfig, type SortModel } from "../types";
import type { FlatRowSource } from "../types/row-grouping-engine";
import { createFieldReader } from "../utils";

/** Every field a dimension or measure reads. */
export const configFields = (config: Pick<PivotConfig, "rows" | "pivots" | "measures">): string[] => [
  ...config.rows.map((dimension) => dimension.field),
  ...config.pivots.map((dimension) => dimension.field),
  ...config.measures.map((measure) => measure.source ?? measure.field),
];

/** A columnar source's fields; object rows declare none, so every field the config names counts as known. */
export const knownFields = <TData>(source: DataSource<TData>, config: Parameters<typeof configFields>[0]) =>
  isColumnarDataSource(source) ? source.access.fields : configFields(config);

export const toFlatResponseSource = <TData>(
  response: DataSourceResponse<TData>,
  fields: readonly string[],
  sort: readonly SortModel[],
): FlatRowSource => {
  const { access, rows } = response;
  const reader: FlatRowSource["reader"] = (field) => {
    if (access !== undefined) return (row) => access.getValue(row, field) ?? null;
    const read = createFieldReader(field);
    return (row) => read(rows[row]) ?? null;
  };
  return {
    rowCount: access?.rowCount ?? rows.length,
    reader,
    getRowId: (row) => row,
    sort,
    fieldOf: (columnId) => columnId,
    fields,
  };
};
