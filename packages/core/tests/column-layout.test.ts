import { describe, expect, it } from "vitest";
import {
  createColumnLayoutResolver,
  resolveColumnLayout,
  type ColumnLayoutInput,
} from "../src/geometry/column-layout";
import type { ColumnDefinition } from "../src/types";

const column = (
  id: string,
  width: number,
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition =>
  ({ field: id, colId: id, cellDataType: "text", width, ...extra }) as ColumnDefinition;

const input = (
  columns: ColumnDefinition[],
  width: number,
  overridden: number[] = [],
): ColumnLayoutInput => ({
  columns,
  mode: "fit",
  width,
  isOverridden: (layoutIndex) => overridden.includes(layoutIndex),
});

describe("resolveColumnLayout", () => {
  it("builds offsets, layout indices and total width", () => {
    const snapshot = resolveColumnLayout(
      input([column("a", 100), column("b", 50), column("c", 30)], 0),
      null,
      7,
    );
    expect(snapshot.revision).toBe(7);
    expect(snapshot.mode).toBe("fit");
    expect(snapshot.totalWidth).toBe(180);
    expect(snapshot.columns.map((c) => [c.columnId, c.layoutIndex, c.offset, c.width])).toEqual([
      ["a", 0, 0, 100],
      ["b", 1, 100, 50],
      ["c", 2, 150, 30],
    ]);
  });

  it("excludes hidden columns while keeping their layout indices", () => {
    const columns = [column("a", 100), column("b", 50, { hidden: true }), column("c", 30)];
    const snapshot = resolveColumnLayout(input(columns, 0), null, 1);
    expect(snapshot.columns.map((c) => [c.columnId, c.layoutIndex, c.offset])).toEqual([
      ["a", 0, 0],
      ["c", 2, 100],
    ]);
    expect(snapshot.totalWidth).toBe(130);
  });

  it("reuses the previous snapshot when nothing observable changed", () => {
    const columns = [column("a", 100)];
    const first = resolveColumnLayout(input(columns, 0), null, 1);
    const second = resolveColumnLayout(input(columns, 0), first, 2);
    expect(second).toBe(first);
    expect(second.revision).toBe(1);
  });

  it("replaces the snapshot when only the definition object changed", () => {
    const first = resolveColumnLayout(input([column("a", 100)], 0), null, 1);
    const replaced = resolveColumnLayout(input([column("a", 100)], 0), first, 2);
    expect(replaced).not.toBe(first);
    expect(replaced.revision).toBe(2);
  });

  it("replaces the snapshot when a hidden column is inserted before a displayed one", () => {
    const first = resolveColumnLayout(input([column("a", 100)], 0), null, 1);
    const columns = [column("hidden", 10, { hidden: true }), column("a", 100)];
    const next = resolveColumnLayout(input(columns, 0), first, 2);
    expect(next).not.toBe(first);
    expect(next.columns[0]!.layoutIndex).toBe(1);
  });

  it("replaces the snapshot on reorder and mode changes with equal widths", () => {
    const first = resolveColumnLayout(input([column("a", 100), column("b", 100)], 0), null, 1);
    const reordered = resolveColumnLayout(
      input([column("b", 100), column("a", 100)], 0),
      first,
      2,
    );
    expect(reordered).not.toBe(first);
    expect(reordered.columns.map((c) => c.columnId)).toEqual(["b", "a"]);

    const fixed = resolveColumnLayout(
      { ...input([column("a", 100), column("b", 100)], 400), mode: "fixed" },
      first,
      3,
    );
    expect(fixed).not.toBe(first);
    expect(fixed.mode).toBe("fixed");
  });

  it("replaces the snapshot when the viewport width changes the resolved widths", () => {
    const columns = [column("a", 100), column("b", 100)];
    const first = resolveColumnLayout(input(columns, 0), null, 1);
    const fitted = resolveColumnLayout(input(columns, 400), first, 2);
    expect(fitted).not.toBe(first);
    expect(fitted.columns.map((c) => c.width)).toEqual([200, 200]);
  });
});

describe("createColumnLayoutResolver", () => {
  it("lazily resolves with the caller's revision", () => {
    let revision = 5;
    const resolver = createColumnLayoutResolver("fit", () => revision);
    resolver.update({
      columns: [column("a", 100)],
      mode: "fit",
      width: 0,
      isOverridden: () => false,
    });
    const snapshot = resolver.get();
    expect(snapshot.revision).toBe(5);
    revision = 6;
    expect(resolver.get().revision).toBe(5);
    expect(resolver.getMode()).toBe("fit");
  });

  it("keeps a snapshot stable across repeated updates and advances on change", () => {
    let revision = 1;
    const resolver = createColumnLayoutResolver("fit", () => revision);
    const columns = [column("a", 100), column("b", 100)];
    const first = resolver.update({ columns, mode: "fit", width: 400, isOverridden: () => false });
    const second = resolver.update({ columns, mode: "fit", width: 400, isOverridden: () => false });
    expect(second).toBe(first);
    expect(first.columns.map((c) => c.width)).toEqual([200, 200]);
    revision = 2;
    // The column model hands out a new layout array on every state change.
    const third = resolver.update({
      columns: [...columns],
      mode: "fit",
      width: 400,
      isOverridden: (index) => index === 0,
    });
    expect(third).not.toBe(first);
    expect(third.revision).toBe(2);
    expect(third.columns.map((c) => c.width)).toEqual([100, 300]);
  });

  it("does not resolve again while columns, width and mode are unchanged", () => {
    const resolver = createColumnLayoutResolver("fit", () => 1);
    const columns = [column("a", 100), column("b", 100)];
    let overrideReads = 0;
    const isOverridden = (): boolean => {
      overrideReads += 1;
      return false;
    };
    const first = resolver.update({ columns, mode: "fit", width: 400, isOverridden });
    const readsAfterFirst = overrideReads;
    for (let step = 0; step < 1_000; step += 1) {
      expect(resolver.update({ columns, mode: "fit", width: 400, isOverridden })).toBe(first);
    }
    expect(overrideReads).toBe(readsAfterFirst);

    expect(resolver.update({ columns, mode: "fit", width: 500, isOverridden })).not.toBe(first);
    resolver.setMode("fixed");
    expect(resolver.update({ columns, mode: "fit", width: 500, isOverridden }).mode).toBe("fixed");
  });
});
