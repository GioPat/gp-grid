// packages/core/tests/filter-request-payload.test.ts
// Regression for the original bug: adding a valueFormatter (display-only)
// silently changed what was sent to server-side data sources — values-mode
// selectedValues used to hold formatted labels. They must hold RAW values.

import { describe, it, expect, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { groupDistinctValues, rawValuesForLabels } from "../src/filtering/distinct-entries";
import type {
  CellValue,
  ColumnDefinition,
  ColumnFilterModel,
  DataSource,
  DataSourceRequest,
  TextFilterCondition,
} from "../src/types";

interface TestRow {
  id: number;
  status: number;
}

const statusFormatter = (v: CellValue): string => (v === 1 ? "Active" : "Inactive");

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50 },
  { field: "status", cellDataType: "number", width: 100, valueFormatter: statusFormatter },
];

const rows: TestRow[] = [
  { id: 1, status: 1 },
  { id: 2, status: 0 },
  { id: 3, status: 1 },
];

/** Build the filter exactly the way the popup does: tick the "Active" label. */
const buildPopupFilter = (distinct: CellValue[]): ColumnFilterModel => {
  const entries = groupDistinctValues(distinct, statusFormatter);
  return {
    conditions: [
      {
        type: "text",
        operator: "equals",
        selectedValues: rawValuesForLabels(entries, new Set(["Active"])),
        includeBlank: false,
      },
    ],
    combination: "and",
  };
};

describe("filter request payload — valueFormatter never leaks to the server", () => {
  it("a server data source receives RAW values in selectedValues, not labels", async () => {
    const requests: DataSourceRequest[] = [];
    const serverSource: DataSource<TestRow> = {
      async query(request) {
        requests.push(request);
        return { rows, totalRows: rows.length };
      },
    };
    const grid = new GridCore<TestRow>({
      columns,
      dataSource: serverSource,
      rowHeight: 32,
      headerHeight: 40,
      overscan: 2,
    });
    await grid.initialize();

    await grid.setFilter("status", buildPopupFilter([1, 0]));

    const withFilter = requests.filter((r) => r.filter?.["status"] !== undefined);
    expect(withFilter.length).toBeGreaterThan(0);
    const lastRequest = withFilter[withFilter.length - 1];
    const condition = lastRequest?.filter?.["status"]?.conditions[0] as TextFilterCondition;
    const selected = [...(condition.selectedValues ?? [])];
    expect(selected).toEqual([1]);
    expect(selected).not.toContain("Active");
  });

  it("warns when an all-string selection targets a non-string column (lossy round-trip lint)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const grid = new GridCore<TestRow>({
        columns,
        dataSource: createClientDataSource<TestRow>([...rows]),
        rowHeight: 32,
        headerHeight: 40,
        overscan: 2,
      });
      await grid.initialize();

      // A model rebuilt from JSON/URL params without reviving types: the
      // number column receives "1" instead of 1 and would match nothing.
      const staleModel: ColumnFilterModel = {
        conditions: [
          {
            type: "text",
            operator: "equals",
            selectedValues: new Set<CellValue>(["1"]),
            includeBlank: false,
          },
        ],
        combination: "and",
      };
      await grid.setFilter("status", staleModel);

      const mismatchWarnings = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("strict identity"),
      );
      expect(mismatchWarnings).toHaveLength(1);

      // Raw values on the same column must not warn.
      await grid.setFilter("id", buildPopupFilter([1, 0]));
      expect(
        warnSpy.mock.calls.filter(
          (call) => typeof call[0] === "string" && call[0].includes("strict identity"),
        ),
      ).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("the client data source matches rows through the raw model", async () => {
    const dataSource = createClientDataSource<TestRow>([...rows]);
    const response = await dataSource.query({
      range: { startRow: 0, endRow: 100 },
      filter: { status: buildPopupFilter([1, 0]) },
      valueFormatters: { status: statusFormatter },
    });
    expect(response.rows.map((r) => r.id)).toEqual([1, 3]);
  });
});
