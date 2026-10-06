// packages/core/src/row-grouping/create-row-grouping.ts
// The grouping configuration: validation, expansion state and builds (D7).

import type { FlatRowSource, RowGrouping, RowGroupingConfig, RowGroupingRejection } from "../types";
import { isBuiltInAggregate } from "./aggregators";
import { createExpansionState } from "./expansion-state";
import { createGroupedAccess } from "./grouped-access";
import { buildGroupedView, type GroupingSpec } from "./grouped-view";

const invalid = (path: string, value: unknown): RangeError =>
  new RangeError(`Invalid rowGrouping.${path}: ${value}`);

const firstRepeat = (values: readonly string[]): string | undefined =>
  values.find((value, index) => values.indexOf(value) !== index);

const validate = (config: RowGroupingConfig): void => {
  if (config.dimensions.length === 0) throw invalid("dimensions", "[]");
  const dimensionId = firstRepeat(config.dimensions.map((dimension) => dimension.id ?? dimension.field));
  if (dimensionId !== undefined) throw invalid("dimensions.id", dimensionId);
  const measures = config.measures ?? [];
  const measureField = firstRepeat(measures.map((measure) => measure.field));
  if (measureField !== undefined) throw invalid("measures.field", measureField);
  const aggregate = measures.find(
    (measure) => typeof measure.aggregate !== "object" && !isBuiltInAggregate(measure.aggregate),
  )?.aggregate;
  if (aggregate !== undefined) throw invalid("measures.aggregate", aggregate);
  const depth = config.defaultExpandedDepth ?? 0;
  if (Number.isNaN(depth) || depth < 0) throw invalid("defaultExpandedDepth", depth);
};

/** A dimension or measure reading a field the source does not declare. */
const unknownField = (spec: GroupingSpec, source: FlatRowSource): RowGroupingRejection | undefined => {
  const known = new Set(source.fields);
  const read = [
    ...spec.dimensions.map((dimension) => dimension.field),
    ...spec.measures.map((measure) => measure.source ?? measure.field),
  ];
  const field = read.find((candidate) => known.has(candidate) === false);
  return field === undefined ? undefined : { reason: "unknown-field", field };
};

export const createRowGrouping = (config: RowGroupingConfig): RowGrouping => {
  validate(config);
  const spec: GroupingSpec = {
    dimensions: [...config.dimensions],
    measures: [...(config.measures ?? [])],
    grandTotal: config.grandTotal,
  };
  const expansion = createExpansionState(config.defaultExpandedDepth ?? 0, config.initialState);
  return {
    getState: expansion.snapshot,
    build: (source) => {
      const unknown = unknownField(spec, source);
      if (unknown) return unknown;
      const view = buildGroupedView(source, spec, expansion);
      return "reason" in view ? view : createGroupedAccess(source, spec, expansion, view);
    },
  };
};
