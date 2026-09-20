// packages/core/tests/column-model.test.ts

import { describe, it, expect, vi, afterEach } from "vitest";
import { ColumnModel, getColumnId } from "../src/column-model";
import type { ColumnDefinition } from "../src/types";

const def = (
  field: string,
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width: 100,
  ...extra,
});

const idsOf = (model: ColumnModel): string[] =>
  model.getLayout().map(getColumnId);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ColumnModel", () => {
  it("normalizes identity to colId ?? field", () => {
    const model = new ColumnModel([
      def("fieldA", { colId: "a" }),
      def("b"),
    ]);
    expect(model.ids()).toEqual(["a", "b"]);
    expect(model.indexOf("a")).toBe(0);
    expect(model.idAt(1)).toBe("b");
  });

  it("keeps the first definition for a duplicate id and diagnoses once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = new ColumnModel([
      def("first", { colId: "x", width: 111 }),
      def("second", { colId: "x", width: 222 }),
    ]);

    expect(idsOf(model)).toEqual(["x"]);
    expect(model.getLayout()[0]?.field).toBe("first");
    expect(model.getLayout()[0]?.width).toBe(111);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[gp-grid] Duplicate column id "x"');

    // A later replacement does not warn again for the same id.
    model.setDefinitions([def("third", { colId: "x" })]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("treats definitions as defaults and user state as an override", () => {
    const model = new ColumnModel([def("a", { width: 100 }), def("b")]);
    expect(model.getLayout()[0]?.width).toBe(100);

    model.setWidth("a", 240);
    expect(model.getLayout()[0]?.width).toBe(240);

    // A replacement definition is ignored while an override exists.
    model.setDefinitions([def("a", { width: 300 }), def("b")]);
    expect(model.getLayout()[0]?.width).toBe(240);

    // Reset restores the current definition default.
    model.resetState(["a"]);
    expect(model.getLayout()[0]?.width).toBe(300);
  });

  it("applies hidden state with definition fallback", () => {
    const model = new ColumnModel([def("a"), def("b", { hidden: true })]);
    expect(model.getLayout()[1]?.hidden).toBe(true);

    model.setState([{ columnId: "a", hidden: true }]);
    model.setState([{ columnId: "b", hidden: false }]);
    expect(model.getLayout()[0]?.hidden).toBe(true);
    expect(model.getLayout()[1]?.hidden).toBe(false);

    model.resetState();
    expect(model.getLayout()[0]?.hidden).toBeUndefined();
    expect(model.getLayout()[1]?.hidden).toBe(true);
  });

  it("retains the order of surviving ids and inserts new ids by definition position", () => {
    const model = new ColumnModel([def("a"), def("b"), def("c")]);
    model.move(2, 0); // c, a, b
    expect(idsOf(model)).toEqual(["c", "a", "b"]);

    model.setDefinitions([def("c"), def("a"), def("d"), def("b")]);
    // Retained relative order survives; d lands before the next retained id (b).
    expect(idsOf(model)).toEqual(["c", "a", "d", "b"]);
  });

  it("adopts the new definition order until a column is explicitly moved", () => {
    const model = new ColumnModel([def("id"), def("name"), def("city"), def("score")]);
    model.setDefinitions([def("score"), def("city"), def("replacement")]);
    expect(idsOf(model)).toEqual(["score", "city", "replacement"]);

    model.move(0, 2);
    expect(idsOf(model)).toEqual(["city", "score", "replacement"]);

    model.setDefinitions([def("replacement"), def("score"), def("city")]);
    // User order survives a definition replacement.
    expect(idsOf(model)).toEqual(["city", "score", "replacement"]);
  });

  it("drops the state of removed ids and reports the diff", () => {
    const model = new ColumnModel([def("a"), def("b")]);
    model.setWidth("a", 250);
    const diff = model.setDefinitions([def("b"), def("c")]);

    expect(diff.removed).toEqual(["a"]);
    expect(diff.added).toEqual(["c"]);
    expect(model.ids()).toEqual(["b", "c"]);
    // An override is the only source of `width`; definitions supply defaults.
    expect(model.getState()).toEqual([
      { columnId: "b", hidden: false, order: 0 },
      { columnId: "c", hidden: false, order: 1 },
    ]);
  });

  it("reports which layout dimensions a state command changed", () => {
    const model = new ColumnModel([def("a"), def("b")]);

    expect(model.setState([{ columnId: "a", width: 180 }])).toEqual({
      orderChanged: false,
      widthChanged: true,
      hiddenChanged: false,
    });
    expect(model.setState([{ columnId: "a", order: 1 }])).toEqual({
      orderChanged: true,
      widthChanged: false,
      hiddenChanged: false,
    });
    expect(model.setState([{ columnId: "a", width: 180 }]).widthChanged).toBe(false);
  });

  it("tracks width-override presence", () => {
    const model = new ColumnModel([def("a", { width: 100 }), def("b", { width: 100 })]);
    expect(model.isWidthOverridden("a")).toBe(false);
    expect(model.isWidthOverriddenAt(0)).toBe(false);

    model.setState([{ columnId: "a", width: 100 }]);
    expect(model.isWidthOverridden("a")).toBe(true);
    expect(model.isWidthOverriddenAt(1)).toBe(false);

    model.resetState(["a"]);
    expect(model.isWidthOverridden("a")).toBe(false);
    expect(model.isWidthOverriddenAt(5)).toBe(false);
  });

  it("reports a width change when an override equal to the definition width is set or reset", () => {
    const model = new ColumnModel([def("a", { width: 100 }), def("b", { width: 100 })]);

    expect(model.setState([{ columnId: "a", width: 100 }])).toEqual({
      orderChanged: false,
      widthChanged: true,
      hiddenChanged: false,
    });
    // The value is unchanged, so a second identical command is a no-op.
    expect(model.setState([{ columnId: "a", width: 100 }]).widthChanged).toBe(false);

    // Removing the override restores the same number but changes the contract.
    expect(model.resetState(["a"])).toEqual({
      orderChanged: false,
      widthChanged: true,
      hiddenChanged: false,
    });
  });

  it("diagnoses an invalid width once per column id until it is valid again", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = new ColumnModel([def("a", { width: 0 }), def("b")]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[gp-grid] Invalid width for column "a"');
    expect(model.getLayout()[0]?.width).toBe(50);

    // A repeated resolve does not warn again.
    model.setWidth("b", 120);
    expect(warn).toHaveBeenCalledTimes(1);

    // An invalid override is normalized in the same way.
    model.setWidth("b", Number.NaN);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(model.getLayout()[1]?.width).toBe(50);

    // Becoming valid clears the memory, so a later regression warns again.
    model.setWidth("b", 90);
    model.setWidth("b", -1);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("does not write to frozen caller definitions", () => {
    const frozen = Object.freeze([
      Object.freeze(def("a", { width: 120 })),
      Object.freeze(def("b", { width: 80 })),
    ]);
    const model = new ColumnModel(frozen);

    expect(() => model.setWidth("a", 200)).not.toThrow();
    expect(frozen[0]?.width).toBe(120);
    expect(model.getLayout()[0]?.width).toBe(200);
  });
  it("retains an explicit order that matches the current position", () => {
    const model = new ColumnModel([def("a"), def("b")]);
    model.setState([{ columnId: "a", order: 0 }]);

    model.setDefinitions([def("b"), def("a")]);

    expect(model.ids()).toEqual(["a", "b"]);
  });
  it("diagnoses a duplicate again after it was fixed and reintroduced", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const duplicated = [def("a", { colId: "x" }), def("b", { colId: "x" })];
    const model = new ColumnModel(duplicated);
    model.setDefinitions(duplicated);
    expect(warn).toHaveBeenCalledTimes(1);

    model.setDefinitions([def("a", { colId: "x" })]);
    model.setDefinitions(duplicated);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
