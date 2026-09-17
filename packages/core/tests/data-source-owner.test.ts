// packages/core/tests/data-source-owner.test.ts

import { describe, it, expect } from "vitest";
import { DataSourceOwner } from "../src/adapter/data-source-owner";
import { createColumnarDataSource } from "../src/data-source";

interface TestRow {
  id: number;
}

describe("DataSourceOwner", () => {
  it("swaps to a runtime-provided source and back to owned rows", () => {
    const rows: TestRow[] = [{ id: 1 }];
    const owner = new DataSourceOwner<TestRow>();
    const owned = owner.initialize(null, rows);
    expect(owned).toBeDefined();

    const columnar = createColumnarDataSource({
      fields: [{ field: "id", data: [1] }],
    });
    // A new provided source replaces the owned one.
    expect(owner.syncRows([], columnar)).toBe(columnar);
    // Re-applying the same provided source is a no-op.
    expect(owner.syncRows([], columnar)).toBeNull();

    // Dropping the provided source rebuilds an owned source even though the
    // rows array reference did not change.
    const rebuilt = owner.syncRows(rows, null);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toBe(columnar);
    expect(owner.syncRows(rows, null)).toBeNull();
  });

  it("keeps using a source provided at initialization", () => {
    const columnar = createColumnarDataSource({
      fields: [{ field: "id", data: [1] }],
    });
    const owner = new DataSourceOwner<TestRow>();
    expect(owner.initialize(columnar, [])).toBe(columnar);
    expect(owner.syncRows([], columnar)).toBeNull();
  });
});
