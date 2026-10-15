// packages/core/src/pivot/create-pivot-source.ts
// A data source that pivots every row of an inner flat source on each query (PRD 012 D3, D4).

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  HierarchicalRowAccess,
  PivotConfig,
  PivotSchema,
  PivotSource,
} from "../types";
import { isBuiltInAggregate } from "../hierarchy/aggregators";
import { createExpansionState } from "../hierarchy/tree-expansion";
import { configFields, knownFields, toFlatResponseSource } from "./flat-response-source";
import { createPivotAccess } from "./pivot-access";
import { resolvePivotOrder } from "./pivot-order";
import { buildPivotView, type PivotSpec } from "./pivot-view";

const DEFAULT_MAX_COLUMNS = 1000;
const EVERY_ROW = { startRow: 0, endRow: Number.MAX_SAFE_INTEGER };

const invalid = (path: string, value: unknown): RangeError =>
  new RangeError(`Invalid pivot.${path}: ${String(value)}`);

const firstRepeat = (values: readonly string[]): number =>
  values.findIndex((value, index) => values.indexOf(value) !== index);

const validateDimensions = (config: PivotConfig): void => {
  if (config.rows.length === 0) throw invalid("rows", "[]");
  if (config.pivots.length === 0) throw invalid("pivots", "[]");
  const ids = [...config.rows, ...config.pivots].map((dimension) => dimension.id ?? dimension.field);
  const repeat = firstRepeat(ids);
  if (repeat >= 0) throw invalid(repeat < config.rows.length ? "rows.id" : "pivots.id", ids[repeat]);
};

const validateMeasures = (config: PivotConfig): void => {
  if (config.measures.length === 0) throw invalid("measures", "[]");
  const fields = config.measures.map((measure) => measure.field);
  const repeat = firstRepeat(fields);
  if (repeat >= 0) throw invalid("measures.field", fields[repeat]);
  const unknown = config.measures.find(
    (measure) => typeof measure.aggregate !== "object" && isBuiltInAggregate(measure.aggregate) === false,
  );
  if (unknown !== undefined) throw invalid("measures.aggregate", unknown.aggregate);
};

const isObjectKey = (value: unknown): boolean =>
  typeof value === "object" && value !== null && value instanceof Date === false;

const validateDomain = (config: PivotConfig): void => {
  const pivotIds = new Set(config.pivots.map((dimension) => dimension.id ?? dimension.field));
  for (const [id, values] of Object.entries(config.domain ?? {})) {
    if (pivotIds.has(id) === false) throw invalid("domain", id);
    const object = values.find(isObjectKey);
    if (object !== undefined) throw invalid(`domain.${id}`, object);
  }
};

const validate = (config: PivotConfig): void => {
  validateDimensions(config);
  validateMeasures(config);
  const depth = config.defaultExpandedDepth ?? 0;
  if (Number.isNaN(depth) || depth < 0) throw invalid("defaultExpandedDepth", depth);
  const maxColumns = config.maxColumns ?? DEFAULT_MAX_COLUMNS;
  if (Number.isNaN(maxColumns) || maxColumns <= 0) throw invalid("maxColumns", maxColumns);
  validateDomain(config);
};

const specOf = (config: PivotConfig): PivotSpec => ({
  rows: [...config.rows],
  pivots: [...config.pivots],
  measures: [...config.measures],
  domain: config.domain,
  rowTotals: config.rowTotals ?? false,
  rowTotalsHeader: config.rowTotalsHeader,
  grandTotal: config.grandTotal,
  maxColumns: config.maxColumns ?? DEFAULT_MAX_COLUMNS,
  labelColumn: config.labelColumn,
  formatKey: config.formatKey,
});

const schemaIds = (schema: PivotSchema): string => {
  const groupIds: string[] = [];
  const pending = [...schema.columnGroups];
  for (let child = pending.pop(); child !== undefined; child = pending.pop()) {
    if (typeof child === "object") {
      groupIds.push(child.groupId);
      pending.push(...child.children);
    }
  }
  return JSON.stringify([schema.columns.map((column) => column.colId), groupIds]);
};

const isPartial = <TData>(response: DataSourceResponse<TData>): boolean =>
  response.access === undefined && response.rows.length < response.totalRows;

export const createPivotSource = <TData>(source: DataSource<TData>, config: PivotConfig): PivotSource<TData> => {
  validate(config);
  const spec = specOf(config);
  const depth = Math.min(config.defaultExpandedDepth ?? 0, spec.rows.length - 1);
  const expansion = createExpansionState(depth, config.initialState);
  const fields = configFields(spec);
  const listeners = new Set<(schema: PivotSchema) => void>();
  let schema: PivotSchema | null = null;
  let current: HierarchicalRowAccess<TData> | null = null;
  /** Moves with every query and on destroy, so a superseded response never publishes its schema. */
  let generation = 0;

  const publish = (next: PivotSchema) => {
    if (schema !== null && schemaIds(schema) === schemaIds(next)) return;
    schema = next;
    for (const listener of [...listeners]) listener(next);
  };

  const query = async (request: DataSourceRequest): Promise<DataSourceResponse<TData>> => {
    if (source.loadMode === "paginated") throw new Error("pivot needs every row");
    const token = ++generation;
    const response = await source.query({
      range: { ...EVERY_ROW },
      filter: request.filter,
      valueFormatters: request.valueFormatters,
    });
    if (token !== generation) throw new Error("Superseded by a later query");
    if (isPartial(response)) throw new Error("pivot needs every row");
    const known = new Set(knownFields(source, spec));
    const unknown = fields.find((field) => known.has(field) === false);
    if (unknown !== undefined) throw new Error(`pivot reads unknown field ${unknown}`);
    const order = resolvePivotOrder(spec, request.sort);
    const view = buildPivotView(toFlatResponseSource(response, [...known], order.sort), spec, order, expansion);
    response.access?.release?.();
    if (typeof view === "string") throw new Error(view);
    publish(view.schema);
    const access = createPivotAccess<TData>(view, expansion);
    current = access;
    return { rows: [], totalRows: access.rowCount, access };
  };

  return {
    loadMode: "all",
    writable: false,
    query,
    getSchema: () => schema,
    subscribeSchema: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => expansion.snapshot(),
    destroy: () => {
      generation += 1;
      listeners.clear();
      current?.release?.();
      current = null;
    },
  };
};
