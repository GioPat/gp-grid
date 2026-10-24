// PRD 015 D2/D3: a batch of updates refreshes without a query (AC-015-01..04, AC-015-06).

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createMutableClientDataSource } from "../src/data-source";
import { createRowGrouping } from "../src/row-grouping";
import { createPivotSource } from "../src/pivot";
import type { TransactionResult } from "../src/managers";
import type { ColumnDefinition, DataSource, GridCoreOptions, GridInstruction } from "../src/types";

interface Row {
  id: number;
  name: string;
  country: string;
  amount: number;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 60 },
  { field: "name", cellDataType: "text", width: 100, editable: true },
  { field: "country", cellDataType: "text", width: 100, editable: true },
  { field: "amount", cellDataType: "number", width: 100, editable: true },
];
const NAME = 1;
const AMOUNT = 3;
const ROW_HEIGHT = 30;

const rowsOf = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `n${i + 1}`, country: i % 2 === 0 ? "IT" : "FR", amount: i * 10 }));

interface Mount {
  count?: number;
  viewportHeight?: number;
  options?: Partial<GridCoreOptions<Row>>;
  withRowId?: boolean;
  readOnly?: boolean;
}

/** A grid over a counting wrapper of a mutable source; `apply` flushes and refreshes with the last result. */
const mount = async ({ count = 5, viewportHeight = 600, options = {}, withRowId = true, readOnly = false }: Mount = {}) => {
  const rows = rowsOf(count);
  const source = createMutableClientDataSource(rows, { getRowId: (row) => row.id, debounceMs: 0, useWorker: false });
  let queries = 0;
  const counted: DataSource<Row> = {
    ...source,
    query: (request) => {
      queries += 1;
      return source.query(request);
    },
  };
  let last: TransactionResult | undefined;
  source.subscribe((result) => {
    last = result;
  });
  const batches: GridInstruction[][] = [];
  const grid = new GridCore<Row>({
    columns,
    dataSource: readOnly ? { ...counted, writable: false } : counted,
    rowHeight: ROW_HEIGHT,
    headerHeight: 30,
    ...(withRowId ? { getRowId: (row: Row) => row.id } : {}),
    ...options,
  });
  grid.onBatchInstruction((batch) => batches.push(batch));
  await grid.initialize();
  grid.setViewport(0, 0, 400, viewportHeight);
  queries = 0;
  batches.length = 0;
  const apply = async (): Promise<void> => {
    await source.flushTransactions();
    const result = last;
    last = undefined;
    await grid.refreshFromTransaction(result);
  };
  const assigned = (): number[] =>
    batches.flat().flatMap((instruction) => (instruction.type === "ASSIGN_SLOT" ? [instruction.rowIndex] : []));
  return { grid, rows, source, apply, queries: () => queries, batches, assigned };
};

describe("transaction refresh — updates without a query (D2, D3)", () => {
  it("an update redraws the mounted rows that changed and nothing else", async () => {
    const { grid, source, apply, queries, assigned } = await mount();
    source.updateCell(2, "amount", 99);

    await apply();

    expect(queries()).toBe(0);
    expect(assigned()).toEqual([1]);
    expect(grid.cells.getValue(1, AMOUNT)).toBe(99);
  });

  it("an update outside the window emits nothing and shows when the row scrolls in", async () => {
    const { grid, source, apply, queries, batches, assigned } = await mount({ count: 100, viewportHeight: 300 });
    source.updateCell(90, "amount", 99);

    await apply();

    expect(queries()).toBe(0);
    expect(batches).toEqual([]);
    expect(grid.cells.getValue(89, AMOUNT)).toBe(99);

    grid.setViewport(85 * ROW_HEIGHT, 0, 400, 300);
    expect(assigned()).toContain(89);
  });

  it("a sorted field keeps the row in place until the next query", async () => {
    const { grid, source, apply, queries } = await mount();
    await grid.sortFilter.setSort("amount", "desc");
    expect(grid.rows.getId(0)).toBe(5);
    source.updateCell(5, "amount", -5);

    await apply();

    expect(queries()).toBe(1);
    expect(grid.rows.getId(0)).toBe(5);
    expect(grid.cells.getValue(0, AMOUNT)).toBe(-5);

    await grid.refresh();
    expect(grid.rows.getId(0)).toBe(4);
    expect(grid.rows.getId(4)).toBe(5);
  });

  it("a filtered field keeps the row visible until the next query", async () => {
    const { grid, source, apply, queries } = await mount();
    await grid.sortFilter.setFilter("name", "n");
    expect(grid.rows.getCount()).toBe(5);
    source.updateCell(1, "name", "zzz");

    await apply();

    expect(queries()).toBe(1);
    expect(grid.rows.getCount()).toBe(5);
    await grid.refresh();
    expect(grid.rows.getCount()).toBe(4);
  });

  it("an add, a remove, clear and a result without details take the full refresh", async () => {
    const { grid, source, apply, queries } = await mount();

    source.addRows([{ id: 6, name: "n6", country: "IT", amount: 60 }]);
    await apply();
    expect(queries()).toBe(1);
    expect(grid.rows.getCount()).toBe(6);

    source.removeRows([1]);
    await apply();
    expect(queries()).toBe(2);
    expect(grid.rows.getCount()).toBe(5);

    source.clear();
    await apply();
    expect(queries()).toBe(3);
    expect(grid.rows.getCount()).toBe(0);

    await grid.refreshFromTransaction();
    expect(queries()).toBe(4);
  });

  it("an open edit on another row survives an update", async () => {
    const { grid, source, apply, queries } = await mount();
    expect(grid.edit.start(1, NAME)).toBe(true);
    source.updateCell(1, "amount", 7);

    await apply();

    expect(queries()).toBe(0);
    expect(grid.edit.getState()).toMatchObject({ row: 1, col: NAME });
  });

  it("a read-only source and a grid without getRowId take the full refresh", async () => {
    const readOnly = await mount({ readOnly: true });
    readOnly.source.updateCell(1, "amount", 7);
    await readOnly.apply();
    expect(readOnly.queries()).toBe(1);

    const anonymous = await mount({ withRowId: false });
    anonymous.source.updateCell(1, "amount", 7);
    await anonymous.apply();
    expect(anonymous.queries()).toBe(1);
  });
});

describe("transaction refresh — under local grouping (AC-015-04)", () => {
  const grouping = () =>
    createRowGrouping({
      dimensions: [{ field: "country" }],
      measures: [{ field: "sum", source: "amount", aggregate: "sum" }],
      grandTotal: "top",
    });

  const mountGrouped = async () => {
    const mounted = await mount({ options: { rowGrouping: grouping() } });
    mounted.grid.rowGroups.setExpanded(null, true);
    mounted.batches.length = 0;
    const sumAt = (row: number): unknown => mounted.grid.cells.getFieldValue(row, "sum");
    return { ...mounted, sumAt };
  };

  it("a measure update refolds the groups without a query", async () => {
    const { grid, source, apply, queries, sumAt } = await mountGrouped();
    expect(sumAt(0)).toBe(100);
    source.updateCell(1, "amount", 100);

    await apply();

    expect(queries()).toBe(0);
    expect(sumAt(0)).toBe(200);
    expect(grid.rows.getViewRow(1)?.kind).toBe("group");
  });

  it("a dimension update regroups the record without a query", async () => {
    const { grid, source, apply, queries, sumAt } = await mountGrouped();
    expect(grid.rows.getViewRow(1)?.id).toContain("FR");
    expect(sumAt(1)).toBe(40);
    source.updateCell(1, "country", "FR");

    await apply();

    expect(queries()).toBe(0);
    expect(sumAt(1)).toBe(40);
    expect(grid.rows.getViewRow(1)?.id).toContain("FR");
    const rowOf1 = Array.from({ length: grid.rows.getCount() }, (_, i) => grid.rows.getViewRow(i))
      .findIndex((row) => row?.kind === "record" && row.id === 1);
    expect(rowOf1).toBeGreaterThan(1);
    expect(rowOf1).toBeLessThan(5);
  });

  it("a record under a collapsed group takes the full refresh and the sum is right", async () => {
    const { grid, source, apply, queries, sumAt } = await mountGrouped();
    const italy = Array.from({ length: grid.rows.getCount() }, (_, i) => grid.rows.getViewRow(i))
      .find((row) => row?.kind === "group" && row.id.includes("IT"));
    grid.rowGroups.setExpanded([italy!.id], false);
    source.updateCell(3, "amount", 120);

    await apply();

    expect(queries()).toBe(1);
    expect(sumAt(0)).toBe(200);
  });

  it("a hierarchy from the source takes the full refresh", async () => {
    const rows = rowsOf(5);
    const inner = createMutableClientDataSource(rows, { getRowId: (row) => row.id, debounceMs: 0, useWorker: false });
    const pivot = createPivotSource(inner, {
      rows: [{ field: "country" }],
      pivots: [{ field: "name" }],
      measures: [{ field: "amount", aggregate: "sum" }],
    });
    let queries = 0;
    const counted: DataSource<Row> = {
      ...pivot,
      query: (request) => {
        queries += 1;
        return pivot.query(request);
      },
    };
    let last: TransactionResult | undefined;
    inner.subscribe((result) => {
      last = result;
    });
    const grid = new GridCore<Row>({ columns, dataSource: counted, rowHeight: ROW_HEIGHT, headerHeight: 30, getRowId: (row) => row.id });
    await grid.initialize();
    grid.setViewport(0, 0, 400, 600);
    queries = 0;

    inner.updateCell(1, "amount", 100);
    await inner.flushTransactions();
    await grid.refreshFromTransaction(last);

    expect(queries).toBe(1);
  });
});
