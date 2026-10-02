// packages/core/tests/grid-core-config-groups.test.ts
// PRD 007 D1, D6, D8: column-group budgets, header band heights and the
// hierarchy options, resolved once at creation.

import { describe, expect, it } from "vitest";
import {
  resolveColumnGroupLimits,
  resolveGridCoreConfig,
  resolveHeaderBandHeights,
} from "../src/grid-core-config";
import type { GridCoreConfig } from "../src/grid-core-config";
import { createClientDataSource } from "../src/data-source";
import type { ColumnGroupLimits, GridCoreOptions } from "../src/types";

interface Row {
  id: number;
}

const dataSource = createClientDataSource<Row>([{ id: 0 }]);

const withOptions = (extra: Partial<GridCoreOptions<Row>>): GridCoreConfig<Row> =>
  resolveGridCoreConfig<Row>({
    columns: [{ field: "id", cellDataType: "number", width: 100 }],
    dataSource,
    rowHeight: 32,
    ...extra,
  });

const fields: Array<keyof ColumnGroupLimits> = ["maxDepth", "maxNodes", "maxFragments"];

describe("resolveGridCoreConfig — columnGroupLimits", () => {
  it("resolves 64, 100,000 and 100,000 for an absent option", () => {
    const expected = { maxDepth: 64, maxNodes: 100_000, maxFragments: 100_000 };
    expect(withOptions({}).columnGroupLimits).toEqual(expected);
    expect(resolveColumnGroupLimits({})).toEqual(expected);
  });

  it("keeps each supplied budget and the defaults of the rest", () => {
    expect(resolveColumnGroupLimits({ maxDepth: 2 }))
      .toEqual({ maxDepth: 2, maxNodes: 100_000, maxFragments: 100_000 });
    expect(withOptions({ columnGroupLimits: { maxNodes: 5, maxFragments: 1 } }).columnGroupLimits)
      .toEqual({ maxDepth: 64, maxNodes: 5, maxFragments: 1 });
  });

  it("rejects a budget that is not a positive safe integer with the field message", () => {
    for (const field of fields) {
      for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, "3"]) {
        const columnGroupLimits = { [field]: value } as ColumnGroupLimits;
        expect(() => withOptions({ columnGroupLimits }))
          .toThrow(new RangeError(`Invalid columnGroupLimits.${field}: ${value}`));
      }
    }
  });

  it("rejects a non-object option", () => {
    for (const value of [3, "deep", null]) {
      expect(() => withOptions({ columnGroupLimits: value as ColumnGroupLimits }))
        .toThrow(new RangeError(`Invalid columnGroupLimits: ${value}`));
    }
  });
});

describe("resolveGridCoreConfig — headerBandHeights", () => {
  it("copies valid heights, so a later caller write changes nothing", () => {
    const heights = [40, 24.5];
    const config = withOptions({ headerBandHeights: heights });
    heights[0] = 99;
    expect(config.headerBandHeights).toEqual([40, 24.5]);
    expect(resolveHeaderBandHeights(undefined)).toEqual([]);
  });

  it("rejects the first height that is not finite and positive with its band", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "40"]) {
      expect(() => withOptions({ headerBandHeights: [36, value as number, 0] }))
        .toThrow(new RangeError(`Invalid headerBandHeights[1]: ${value}`));
    }
    expect(() => resolveHeaderBandHeights([, 40] as number[]))
      .toThrow(new RangeError("Invalid headerBandHeights[0]: undefined"));
  });

  it("rejects a value that is not a list", () => {
    expect(() => resolveHeaderBandHeights(40 as unknown as number[]))
      .toThrow(new RangeError("Invalid headerBandHeights: 40"));
  });
});

describe("resolveGridCoreConfig — columnGroups", () => {
  it("passes the hierarchy and the callback through unvalidated", () => {
    const columnGroups = [{ groupId: "g", children: ["missing"] }];
    const onColumnSchemaRejected = (): void => {};
    const config = withOptions({ columnGroups, onColumnSchemaRejected });
    expect(config.columnGroups).toBe(columnGroups);
    expect(config.onColumnSchemaRejected).toBe(onColumnSchemaRejected);
  });
});
