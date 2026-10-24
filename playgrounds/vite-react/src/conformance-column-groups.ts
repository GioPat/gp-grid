// playgrounds/vite-react/src/conformance-column-groups.ts
// Column-group and header-band conformance fixture (PRD 007). Fixture logic
// lives here so the shared conformance app does not grow past its budget.

import type {
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupDefinition,
  ColumnGroupLimits,
  ColumnLayoutMode,
  ColumnPin,
  ColumnSchemaError,
  ColumnSchemaResult,
  GridCore,
  HeaderBandLayout,
  HeaderFragment,
} from "@gp-grid/react";

/** `off` keeps the fixture's own grid; the others arm a grouped one. */
export type ColumnGroupsMode = "off" | "groups" | "wide";

/** Slice 3 recipe: 32 px rows, 36 px bands, fixed 120 px leaves. */
export const COLUMN_GROUPS_ROW_HEIGHT = 32;
export const COLUMN_GROUPS_HEADER_HEIGHT = 36;
export const COLUMN_GROUPS_COLUMN_LAYOUT: ColumnLayoutMode = "fixed";
/** The short host: three frozen rows fit under four 36 px bands, not once the last one is 72 px. */
export const COLUMN_GROUPS_HOST_HEIGHT = 330;
export const TALL_BAND_HEIGHT = 72;
const LEAF_WIDTH = 120;
const ROW_COUNT = 1000;
const WIDE_ROW_COUNT = 100;
const WIDE_LEAF_COUNT = 200;
/** The wide arm's leaf whose wrapped header is taller than its band (AC-007-12). */
const WIDE_TALL_LEAF = 150;
const WIDE_TALL_HEADER =
  "Quarterly revenue forecast adjusted for seasonal currency exposure across all regional markets";

export type ColumnGroupsRow = Record<string, number | string>;

/** The columns and hierarchy the grid receives together. */
export interface ColumnGroupsSchema {
  readonly columns: ColumnDefinition[];
  readonly groups: readonly ColumnGroupChild[] | undefined;
}

const LEAF_IDS = ["a", "b", "c", "d", "e", "f", "x"] as const;

const createLeafColumns = (): ColumnDefinition[] =>
  LEAF_IDS.map((id) => ({
    colId: id,
    field: id,
    headerName: id.toUpperCase(),
    width: LEAF_WIDTH,
    cellDataType: "text" as const,
  }));

const createLeafRows = (): ColumnGroupsRow[] =>
  Array.from({ length: ROW_COUNT }, (_, index) => {
    const row: ColumnGroupsRow = { id: index };
    for (const id of LEAF_IDS) row[id] = `${id.toUpperCase()} ${index}`;
    return row;
  });

const group = (groupId: string, children: ColumnGroupChild[]): ColumnGroupDefinition =>
  ({ groupId, headerName: groupId, children });

/**
 * `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped
 * `x`: three levels above `a` and `b`, an uneven branch and a second root.
 */
const createGroups = (q1: ColumnGroupChild[], north: ColumnGroupChild[]): ColumnGroupChild[] => [
  group("Region", [group("North", [group("Q1", q1), ...north]), "d"]),
  group("Totals", ["e", "f"]),
  "x",
];

/** `reject-cycle`: Region lists itself after its own children. */
const createCyclicGroups = (): ColumnGroupChild[] => {
  const children: ColumnGroupChild[] = [group("North", [group("Q1", ["a", "b"]), "c"]), "d"];
  const region = group("Region", children);
  children.push(region);
  return [region, group("Totals", ["e", "f"]), "x"];
};

/** 200 leaves in 50 groups of 4 under 10 groups of 5. */
const createWideGroups = (): ColumnGroupChild[] =>
  Array.from({ length: 10 }, (_, top) =>
    group(`T${top}`, Array.from({ length: 5 }, (_, offset) => {
      const middle = top * 5 + offset;
      return group(`M${middle}`, Array.from({ length: 4 }, (_, leaf) => `w${middle * 4 + leaf}`));
    })));

const createWideColumns = (): ColumnDefinition[] =>
  Array.from({ length: WIDE_LEAF_COUNT }, (_, index) => ({
    colId: `w${index}`,
    field: `w${index}`,
    headerName: index === WIDE_TALL_LEAF ? WIDE_TALL_HEADER : `W${index}`,
    wrapHeaderText: index === WIDE_TALL_LEAF,
    width: LEAF_WIDTH,
    cellDataType: "number" as const,
  }));

const createWideRows = (): ColumnGroupsRow[] =>
  Array.from({ length: WIDE_ROW_COUNT }, (_, index) => {
    const row: ColumnGroupsRow = { id: index };
    for (let leaf = 0; leaf < WIDE_LEAF_COUNT; leaf += 1) row[`w${leaf}`] = index * WIDE_LEAF_COUNT + leaf;
    return row;
  });

const columnIdOf = (column: ColumnDefinition): string => column.colId ?? column.field;

const layoutIndexOf = (core: GridCore<unknown>, columnId: string): number =>
  core.columns.get().findIndex((column) => columnIdOf(column) === columnId);

export interface ColumnGroupsFixture {
  schemaFor(mode: ColumnGroupsMode): ColumnGroupsSchema;
  rowDataFor(mode: ColumnGroupsMode): ColumnGroupsRow[] | undefined;
  /** `replace-groups`: Q1 becomes `{a}`, and `b` joins North. */
  replacement(schema: ColumnGroupsSchema): ColumnGroupsSchema;
  /** `reject-cycle` and `reject-missing` (no `x`): hierarchies the core rejects. */
  cyclic(schema: ColumnGroupsSchema): ColumnGroupsSchema;
  missing(schema: ColumnGroupsSchema): ColumnGroupsSchema;
  /** `tall-band`: every band at its current height, the last one at 72 px. */
  tallBandHeights(core: GridCore<unknown>): number[];
  /** `over-budget-move`: `maxFragments` at the current run count, every run being mounted. */
  overBudgetLimits(core: GridCore<unknown>): ColumnGroupLimits;
  /** Controls that call the core; each records its result. */
  moveXBetween(core: GridCore<unknown>): void;
  moveXBack(core: GridCore<unknown>): void;
  setHidden(core: GridCore<unknown>, columnId: string, hidden: boolean): void;
  pin(core: GridCore<unknown>, columnId: string, pinned: ColumnPin | null): void;
  resetOrder(core: GridCore<unknown>): void;
  /** Prop changes report through `onColumnSchemaRejected` only. */
  recordRejection(error: ColumnSchemaError): void;
  clearResult(): void;
  lastResult(): ColumnSchemaResult | null;
}

export const createColumnGroupsFixture = (): ColumnGroupsFixture => {
  const leafColumns = createLeafColumns();
  const leafRows = createLeafRows();
  const wideColumns = createWideColumns();
  const wideRows = createWideRows();
  const flat: ColumnGroupsSchema = { columns: [], groups: undefined };
  let last: ColumnSchemaResult | null = null;
  const record = (result: ColumnSchemaResult): void => {
    last = result;
  };

  return {
    schemaFor: (mode) => {
      if (mode === "groups") return { columns: leafColumns, groups: createGroups(["a", "b"], ["c"]) };
      if (mode === "wide") return { columns: wideColumns, groups: createWideGroups() };
      return flat;
    },
    rowDataFor: (mode) => {
      if (mode === "groups") return leafRows;
      return mode === "wide" ? wideRows : undefined;
    },
    replacement: (schema) => ({ columns: schema.columns, groups: createGroups(["a"], ["b", "c"]) }),
    cyclic: (schema) => ({ columns: schema.columns, groups: createCyclicGroups() }),
    missing: (schema) => ({ columns: schema.columns, groups: createGroups(["a", "b"], ["c"]).slice(0, 2) }),
    tallBandHeights: (core) => {
      const { heights } = core.header.getBands();
      return heights.map((height, band) => (band === heights.length - 1 ? TALL_BAND_HEIGHT : height));
    },
    overBudgetLimits: (core) => {
      const { start, center, end } = core.geometry.getColumnWindow().groups;
      return { maxFragments: start.length + center.length + end.length };
    },
    moveXBetween: (core) => record(core.columns.move(layoutIndexOf(core, "x"), layoutIndexOf(core, "b"))),
    moveXBack: (core) => record(core.columns.move(layoutIndexOf(core, "x"), core.columns.get().length)),
    setHidden: (core, columnId, hidden) => record(core.columns.setState([{ columnId, hidden }])),
    pin: (core, columnId, pinned) => record(core.columns.setPinned(columnId, pinned)),
    resetOrder: (core) => record(core.columns.resetState()),
    recordRejection: (error) => record({ status: "rejected", error }),
    clearResult: () => {
      last = null;
    },
    lastResult: () => last,
  };
};

/** Header hooks (PRD 007); the hierarchy and band heights go through the grid's props. */
export interface ColumnGroupHooks {
  headerBands: () => HeaderBandLayout | null;
  /** Mounted fragments: start, center and end. */
  headerFragments: () => HeaderFragment[];
  /** The core's active hierarchy, as the caller passed it. */
  columnGroups: () => readonly ColumnGroupChild[] | null;
  /** `null` makes the grid flat. */
  setColumnGroups: (groups: ColumnGroupChild[] | null) => void;
  /** `null` drops every configured height. */
  setHeaderBandHeights: (heights: number[] | null) => void;
  pinColumn: (columnId: string, pinned: ColumnPin | null) => void;
  lastSchemaResult: () => ColumnSchemaResult | null;
}

export interface ColumnGroupProps {
  setGroups: (groups: readonly ColumnGroupChild[] | undefined) => void;
  setBandHeights: (heights: readonly number[] | undefined) => void;
}

export const createColumnGroupHooks = (
  getCore: () => GridCore<unknown> | null | undefined,
  fixture: ColumnGroupsFixture,
  props: ColumnGroupProps,
): ColumnGroupHooks => ({
  headerBands: () => getCore()?.header.getBands() ?? null,
  headerFragments: () => {
    const groups = getCore()?.geometry.getColumnWindow().groups;
    return groups === undefined ? [] : [...groups.start, ...groups.center, ...groups.end];
  },
  columnGroups: () => getCore()?.columns.getGroups() ?? null,
  setColumnGroups: (groups) => {
    fixture.clearResult();
    props.setGroups(groups ?? undefined);
  },
  setHeaderBandHeights: (heights) => props.setBandHeights(heights ?? undefined),
  pinColumn: (columnId, pinned) => {
    const core = getCore();
    if (core) fixture.pin(core, columnId, pinned);
  },
  lastSchemaResult: () => fixture.lastResult(),
});
