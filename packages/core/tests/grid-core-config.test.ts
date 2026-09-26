// packages/core/tests/grid-core-config.test.ts
// C1: freezeRows defaults and validation, and the core-resolved label set.

import { describe, expect, it } from "vitest";
import { resolveFreezeRowsOptions, resolveGridCoreConfig } from "../src/grid-core-config";
import type { GridCoreConfig } from "../src/grid-core-config";
import { createClientDataSource } from "../src/data-source";
import { defaultGridLabels } from "../src/i18n";
import {
  DEFAULT_MAX_FROZEN_ROWS,
  DEFAULT_MIN_SUFFIX_HEIGHT,
} from "../src/geometry";
import type { FreezeRowsOptions, GridCoreOptions } from "../src/types";

interface Row {
  id: number;
}

const rows: Row[] = [{ id: 0 }, { id: 1 }];
// One instance: toEqual compares the data source's methods by identity.
const dataSource = createClientDataSource(rows);

const baseOptions = (): GridCoreOptions<Row> => ({
  columns: [{ field: "id", cellDataType: "number", width: 100 }],
  dataSource,
  rowHeight: 32,
});

const resolve = (freezeRows?: unknown): GridCoreConfig<Row> =>
  resolveGridCoreConfig<Row>({
    ...baseOptions(),
    freezeRows: freezeRows as FreezeRowsOptions | undefined,
  });

/** Everything the resolved config owns except the freeze option. */
const withoutFreezeRows = (config: GridCoreConfig<Row>): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...config };
  delete copy.freezeRows;
  return copy;
};

const invalid = (value: unknown, field?: string): RangeError =>
  new RangeError(
    field === undefined
      ? `Invalid freezeRows: ${value}`
      : `Invalid freezeRows.${field}: ${value}`,
  );

const invalidCounts = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, "3"];

describe("resolveGridCoreConfig — freezeRows defaults", () => {
  it("resolves the documented defaults for an absent option", () => {
    const config = resolve(undefined);
    expect(config.freezeRows).toEqual({
      count: 0,
      maxCount: DEFAULT_MAX_FROZEN_ROWS,
      minSuffixHeight: DEFAULT_MIN_SUFFIX_HEIGHT,
    });
    expect(config.freezeRows.maxCount).toBe(100);
    expect(config.freezeRows.minSuffixHeight).toBe(64);
  });

  it("leaves every other resolved option unchanged", () => {
    const withoutOption = resolve(undefined);
    const withOption = resolve({ count: 3 });
    expect(withoutFreezeRows(withOption)).toEqual(withoutFreezeRows(withoutOption));
    expect(withoutOption.headerHeight).toBe(32);
    expect(withoutOption.overscan).toBe(3);
    expect(withoutOption.maxFlingVelocity).toBe(640);
    expect(withoutOption.sortingEnabled).toBe(true);
    expect(withoutOption.rowDragEntireRow).toBe(false);
    expect(withoutOption.columnLayout).toBe("fit");
    expect(withoutOption.columnOverscan).toBe(240);
  });

  it("keeps both limits' defaults for a partial count", () => {
    expect(resolve({ count: 3 }).freezeRows).toEqual({
      count: 3,
      maxCount: DEFAULT_MAX_FROZEN_ROWS,
      minSuffixHeight: DEFAULT_MIN_SUFFIX_HEIGHT,
    });
  });

  it("overrides one limit at a time", () => {
    expect(resolve({ count: 3, maxCount: 7 }).freezeRows).toEqual({
      count: 3,
      maxCount: 7,
      minSuffixHeight: DEFAULT_MIN_SUFFIX_HEIGHT,
    });
    expect(resolve({ count: 3, minSuffixHeight: 0 }).freezeRows).toEqual({
      count: 3,
      maxCount: DEFAULT_MAX_FROZEN_ROWS,
      minSuffixHeight: 0,
    });
  });

  it("accepts maxCount 0 and count 0", () => {
    expect(resolve({ count: 0, maxCount: 0 }).freezeRows).toEqual({
      count: 0,
      maxCount: 0,
      minSuffixHeight: DEFAULT_MIN_SUFFIX_HEIGHT,
    });
  });
});

describe("resolveGridCoreConfig — freezeRows validation", () => {
  it("rejects invalid count values with the field message", () => {
    for (const value of invalidCounts) {
      expect(() => resolve({ count: value as number })).toThrow(
        invalid(value, "count"),
      );
    }
  });

  it("rejects a missing count with the same message", () => {
    expect(() => resolve({} as FreezeRowsOptions)).toThrow(
      invalid(undefined, "count"),
    );
  });

  it("rejects invalid maxCount values with the field message", () => {
    for (const value of invalidCounts) {
      expect(() => resolve({ count: 1, maxCount: value as number })).toThrow(
        invalid(value, "maxCount"),
      );
    }
  });

  it("rejects negative, NaN and infinite minSuffixHeight and accepts 0", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolve({ count: 1, minSuffixHeight: value })).toThrow(
        invalid(value, "minSuffixHeight"),
      );
    }
    expect(resolve({ count: 1, minSuffixHeight: 0 }).freezeRows.minSuffixHeight).toBe(0);
  });

  it("rejects a non-object freezeRows", () => {
    for (const value of [3, "rows", null]) {
      expect(() => resolve(value)).toThrow(invalid(value));
    }
  });
});

describe("resolveGridCoreConfig — labels", () => {
  it("defaults to the full English label set", () => {
    expect(resolve(undefined).labels).toEqual(defaultGridLabels);
  });

  it("resolves overrides over the defaults", () => {
    const config = resolveGridCoreConfig<Row>({
      ...baseOptions(),
      labels: { frozenRowsLimited: "{effective}/{requested} righe", operators: { equals: "=" } },
    });
    expect(config.labels.frozenRowsLimited).toBe("{effective}/{requested} righe");
    expect(config.labels.operators.equals).toBe("=");
    expect(config.labels.operators.notEquals).toBe("Does not equal");
    expect(config.labels.emptyState).toBe(defaultGridLabels.emptyState);
  });
});

// C12: the runtime setter validates through the same resolver, so its table
// cannot drift from the option's.
describe("resolveFreezeRowsOptions", () => {
  it("answers the option's own table", () => {
    const cases: Array<[FreezeRowsOptions | undefined, unknown]> = [
      [undefined, { count: 0, maxCount: 100, minSuffixHeight: 64 }],
      [{ count: 3 }, { count: 3, maxCount: 100, minSuffixHeight: 64 }],
      [{ count: 3, maxCount: 7 }, { count: 3, maxCount: 7, minSuffixHeight: 64 }],
      [{ count: 3, minSuffixHeight: 0 }, { count: 3, maxCount: 100, minSuffixHeight: 0 }],
      [{ count: 0, maxCount: 0 }, { count: 0, maxCount: 0, minSuffixHeight: 64 }],
    ];
    for (const [option, expected] of cases) {
      expect(resolveFreezeRowsOptions(option)).toEqual(expected);
      expect(resolveGridCoreConfig<Row>({ ...baseOptions(), freezeRows: option }).freezeRows)
        .toEqual(expected);
    }
  });

  it("rejects with the option's exact messages", () => {
    for (const value of invalidCounts) {
      expect(() => resolveFreezeRowsOptions({ count: value as number })).toThrow(invalid(value, "count"));
      expect(() => resolveFreezeRowsOptions({ count: 1, maxCount: value as number }))
        .toThrow(invalid(value, "maxCount"));
    }
    expect(() => resolveFreezeRowsOptions({} as FreezeRowsOptions))
      .toThrow(invalid(undefined, "count"));
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveFreezeRowsOptions({ count: 1, minSuffixHeight: value }))
        .toThrow(invalid(value, "minSuffixHeight"));
    }
    for (const value of [3, "rows", null] as unknown[]) {
      expect(() => resolveFreezeRowsOptions(value as FreezeRowsOptions)).toThrow(invalid(value));
    }
    expect(resolveFreezeRowsOptions({ count: 1, minSuffixHeight: 0 }).minSuffixHeight).toBe(0);
  });
});
