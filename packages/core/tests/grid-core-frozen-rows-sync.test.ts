// packages/core/tests/grid-core-frozen-rows-sync.test.ts
// C9/C13 publication rules in isolation: layout identity, the baseline, the
// change event and the live-region announcement.

import { describe, expect, it } from "vitest";
import { FrozenRowsSync } from "../src/grid-core-frozen-rows-sync";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { InstructionBatcher } from "../src/managers";
import { defaultGridLabels, resolveGridLabels } from "../src/i18n";
import type {
  FrozenRowsLimit,
  FrozenRowsState,
  RowRegionLayout,
} from "../src/geometry";
import type { ColumnDefinition, GridInstruction } from "../src/types";

const layout = (
  effectiveCount: number,
  limit: FrozenRowsLimit,
  suffixViewportHeight = 320,
  requestedCount = 3,
): RowRegionLayout => ({
  frozenCount: effectiveCount,
  frozenExtent: effectiveCount * 32,
  suffixViewportHeight,
  frozen: { requestedCount, effectiveCount, limit },
});

const emptyAxis = (requestedCount = 3): FrozenRowsState => ({
  requestedCount,
  effectiveCount: 0,
  limit: null,
});

interface Harness {
  sync: FrozenRowsSync;
  batches: GridInstruction[][];
  changed: FrozenRowsState[];
}

const createHarness = (
  baseline: FrozenRowsState = emptyAxis(),
  withCallback = true,
  labels = defaultGridLabels,
): Harness => {
  const batcher = new InstructionBatcher();
  const batches: GridInstruction[][] = [];
  batcher.subscribe((batch) => batches.push([...batch]));
  const changed: FrozenRowsState[] = [];
  const sync = new FrozenRowsSync({
    batcher,
    labels,
    getFrozenRowsBaseline: () => baseline,
    onFrozenRowsChanged: withCallback ? (state) => changed.push(state) : undefined,
  });
  return { sync, batches, changed };
};

const typesOf = (batches: GridInstruction[][]): string[] =>
  batches.flat().map((instruction) => instruction.type);

const announcementOf = (
  batches: GridInstruction[][],
): { message: string; revision: number } | null => {
  const announcement = batches
    .flat()
    .filter((instruction) => instruction.type === "SET_ANNOUNCEMENT")
    .at(-1);
  return announcement?.type === "SET_ANNOUNCEMENT" ? announcement.announcement : null;
};

describe("FrozenRowsSync", () => {
  it("emits SET_ROW_REGIONS once per layout object", () => {
    // Baseline equal to the published state: only the layout instruction runs.
    const { sync, batches } = createHarness({ requestedCount: 3, effectiveCount: 3, limit: null });
    const regions = layout(3, null);

    sync.publish(regions, 7);
    sync.publish(regions, 8);

    expect(batches).toEqual([
      [{ type: "SET_ROW_REGIONS", regions, revision: 7 }],
    ]);
  });

  it("keeps the first resolution as a silent baseline", () => {
    const { sync, batches, changed } = createHarness(emptyAxis());

    sync.publish(layout(0, null), 1);

    expect(typesOf(batches)).toEqual(["SET_ROW_REGIONS"]);
    expect(changed).toEqual([]);
    expect(announcementOf(batches)).toBeNull();
  });

  it("fires on a changed effective count but announces only a limit change", () => {
    const { sync, batches, changed } = createHarness(emptyAxis());

    sync.publish(layout(3, null), 11);

    expect(changed).toEqual([{ requestedCount: 3, effectiveCount: 3, limit: null }]);
    expect(typesOf(batches)).toEqual(["SET_ROW_REGIONS"]);
    expect(announcementOf(batches)).toBeNull();

    sync.publish(layout(2, "viewport"), 12);
    expect(typesOf(batches).at(-1)).toBe("SET_ANNOUNCEMENT");
    expect(announcementOf(batches)).toEqual({ message: "2 of 3 rows frozen", revision: 12 });
  });

  it("stays silent when the count changes under the same limit", () => {
    const { sync, batches } = createHarness(emptyAxis());

    sync.publish(layout(2, "viewport"), 1);
    sync.publish(layout(1, "viewport"), 2);

    expect(typesOf(batches)).toEqual(["SET_ROW_REGIONS", "SET_ANNOUNCEMENT", "SET_ROW_REGIONS"]);
  });

  it("fires again when the limit returns to null and stays silent on equal state", () => {
    const { sync, batches, changed } = createHarness(emptyAxis());

    sync.publish(layout(0, "viewport"), 4);
    sync.publish(layout(3, null, 224), 5);
    // Same count and limit, different extents: the layout publishes, the
    // event and the announcement stay quiet.
    sync.publish(layout(3, null, 200), 6);

    expect(changed).toEqual([
      { requestedCount: 3, effectiveCount: 0, limit: "viewport" },
      { requestedCount: 3, effectiveCount: 3, limit: null },
    ]);
    expect(typesOf(batches)).toEqual([
      "SET_ROW_REGIONS",
      "SET_ANNOUNCEMENT",
      "SET_ROW_REGIONS",
      "SET_ANNOUNCEMENT",
      "SET_ROW_REGIONS",
    ]);
    expect(announcementOf(batches)).toEqual({ message: "3 of 3 rows frozen", revision: 5 });
  });

  it("fires once per change, not per revision or per equal-state layout", () => {
    const { sync, changed } = createHarness(emptyAxis());

    sync.publish(layout(2, "cache"), 1);
    sync.publish(layout(2, "cache"), 2);
    sync.publish(layout(2, "cache", 300), 3);

    expect(changed).toEqual([{ requestedCount: 3, effectiveCount: 2, limit: "cache" }]);
  });

  it("reports a limit change at an unchanged effective count", () => {
    const { sync, changed } = createHarness(emptyAxis());

    sync.publish(layout(3, "maxCount"), 1);
    sync.publish(layout(3, "viewport"), 2);

    expect(changed.map((state) => state.limit)).toEqual(["maxCount", "viewport"]);
  });

  it("compares later changes against the baseline until one fires", () => {
    const { sync, changed } = createHarness(emptyAxis());

    // Equal to the baseline: silent, and the baseline stays the comparison.
    sync.publish(layout(0, null), 1);
    // Only the limit differs from the baseline, so this is a real change.
    sync.publish(layout(0, "viewport"), 2);

    expect(changed).toEqual([{ requestedCount: 3, effectiveCount: 0, limit: "viewport" }]);
  });

  it("interpolates an overridden label and never publishes a null announcement", () => {
    const labels = resolveGridLabels({
      frozenRowsLimited: "{effective} von {requested} Zeilen fixiert",
    });
    const { sync, batches } = createHarness(emptyAxis(), true, labels);

    sync.publish(layout(1, "cache"), 9);

    expect(announcementOf(batches)).toEqual({
      message: "1 von 3 Zeilen fixiert",
      revision: 9,
    });
    const announcements = batches
      .flat()
      .filter((instruction) => instruction.type === "SET_ANNOUNCEMENT");
    expect(announcements.every((instruction) => instruction.announcement !== null)).toBe(true);
  });

  it("announces without a change callback", () => {
    const { sync, batches } = createHarness(emptyAxis(), false);

    sync.publish(layout(3, "maxCount"), 2);

    expect(typesOf(batches)).toEqual(["SET_ROW_REGIONS", "SET_ANNOUNCEMENT"]);
  });
});

describe("FrozenRowsSync — manager wiring", () => {
  const columns: ColumnDefinition[] = [{ field: "id", cellDataType: "number", width: 100 }];

  it("fires the option callback from a live core and formats with config.labels", async () => {
    const changed: FrozenRowsState[] = [];
    const grid = new GridCore<{ id: number }>({
      columns,
      dataSource: createClientDataSource(
        Array.from({ length: 50 }, (_, id) => ({ id })),
      ),
      rowHeight: 32,
      headerHeight: 36,
      labels: { frozenRowsLimited: "{effective}/{requested}" },
      onFrozenRowsChanged: (state) => changed.push(state),
    });
    // The facade answers before initialize(); the request is still absent.
    expect(grid.frozenRows.get()).toEqual({
      requestedCount: 0,
      effectiveCount: 0,
      limit: null,
    });
    const batches: GridInstruction[][] = [];
    grid.onBatchInstruction((batch) => batches.push([...batch]));

    await grid.initialize();
    grid.setViewport(0, 0, 400, 320);
    // The zero-count flat path announces nothing.
    expect(announcementOf(batches)).toBeNull();
    grid.setFrozenRowsRequest({ requestedCount: 3 });

    expect(grid.frozenRows.get()).toEqual({
      requestedCount: 3,
      effectiveCount: 3,
      limit: null,
    });
    expect(changed).toEqual([{ requestedCount: 3, effectiveCount: 3, limit: null }]);
    expect(announcementOf(batches)).toBeNull();

    // An ordinary scroll sample re-publishes nothing.
    grid.setViewport(32, 0, 400, 320);
    expect(changed).toHaveLength(1);

    grid.setFrozenRowsRequest({ requestedCount: 3, maxCount: 2 });
    expect(announcementOf(batches)).toEqual({
      message: "2/3",
      revision: expect.any(Number),
    });
    grid.destroy();
  });
});
