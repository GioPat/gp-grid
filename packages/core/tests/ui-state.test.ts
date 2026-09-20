import { describe, expect, it } from "vitest";
import { applyInstruction } from "../src/state-reducer";
import { createInitialState } from "../src/types/ui-state";
import type { ColumnDefinition } from "../src/types";
import type { ColumnLayoutSnapshot } from "../src/types/geometry";

const column = (field: string, width: number, extra: Partial<ColumnDefinition> = {}): ColumnDefinition =>
  ({ field, cellDataType: "text", width, ...extra }) as ColumnDefinition;

const twoColumns = (): ColumnDefinition[] => [column("a", 100), column("b", 100)];

describe("createInitialState — defaults", () => {
  it("starts empty, in fit mode, with no layout and no pending scroll", () => {
    const state = createInitialState();
    expect(state.columns).toEqual([]);
    expect(state.layout).toBeNull();
    expect(state.columnLayout).toBe("fit");
    expect(state.geometryRevision).toBe(0);
    expect(state.contentWidth).toBe(0);
    expect(state.peekCell).toBeNull();
    expect(state.pendingScrollTop).toBeNull();
    expect(state.pendingScrollLeft).toBeNull();
  });

  it("hands out independent maps per state", () => {
    const first = createInitialState();
    const second = createInitialState();
    first.slots.set("slot-0", { slotId: "slot-0", rowIndex: 0, rowData: undefined, generation: 1, translateY: 0 });
    expect(second.slots.size).toBe(0);
    expect(first.headers).not.toBe(second.headers);
  });

  it("keeps an empty column list without a layout", () => {
    const state = createInitialState({ initialColumns: [], initialWidth: 800 });
    expect(state.layout).toBeNull();
    expect(state.contentWidth).toBe(0);
    expect(state.viewportWidth).toBe(800);
  });
});

describe("createInitialState — seeded first render", () => {
  it("fits the seeded columns to the initial width", () => {
    const columns = twoColumns();
    const state = createInitialState({ initialColumns: columns, initialWidth: 400, initialHeight: 300 });
    expect(state.columns).toBe(columns);
    expect(state.layout?.mode).toBe("fit");
    expect(state.layout?.revision).toBe(0);
    expect(state.layout?.columns.map((c) => [c.columnId, c.offset, c.width])).toEqual([
      ["a", 0, 200],
      ["b", 200, 200],
    ]);
    expect(state.contentWidth).toBe(400);
    expect(state.contentWidth).toBe(state.layout?.totalWidth);
    expect(state.viewportHeight).toBe(300);
  });

  it("keeps declared widths in fixed mode and mirrors the mode", () => {
    const state = createInitialState({
      initialColumns: twoColumns(),
      initialWidth: 400,
      initialColumnLayout: "fixed",
    });
    expect(state.columnLayout).toBe("fixed");
    expect(state.layout?.mode).toBe("fixed");
    expect(state.layout?.columns.map((c) => c.width)).toEqual([100, 100]);
    expect(state.contentWidth).toBe(200);
  });

  it("uses declared widths when no initial width is known", () => {
    const state = createInitialState({ initialColumns: twoColumns() });
    expect(state.layout?.columns.map((c) => c.width)).toEqual([100, 100]);
    expect(state.contentWidth).toBe(200);
    expect(state.viewportWidth).toBe(0);
  });

  it("leaves hidden columns out of the seeded layout but keeps their index", () => {
    const columns = [column("a", 100), column("b", 100, { hidden: true }), column("c", 100)];
    const state = createInitialState({ initialColumns: columns, initialWidth: 0 });
    expect(state.columns).toHaveLength(3);
    expect(state.layout?.columns.map((c) => [c.columnId, c.layoutIndex])).toEqual([
      ["a", 0],
      ["c", 2],
    ]);
  });

  it("prefers a core-resolved layout over resolving the columns again", () => {
    const columns = twoColumns();
    const initialLayout: ColumnLayoutSnapshot = {
      revision: 12,
      mode: "fixed",
      totalWidth: 640,
      columns: [{ columnId: "a", layoutIndex: 0, column: columns[0]!, offset: 0, width: 640 }],
    };
    const state = createInitialState({ initialColumns: columns, initialWidth: 400, initialLayout });
    expect(state.layout).toBe(initialLayout);
    expect(state.contentWidth).toBe(640);
  });
});

describe("seeded state is replaced by the first core batch", () => {
  it("takes the published layout, revision and content size over the seed", () => {
    const columns = twoColumns();
    const seeded = createInitialState({ initialColumns: columns, initialWidth: 400 });
    const published: ColumnLayoutSnapshot = {
      revision: 3,
      mode: "fit",
      totalWidth: 900,
      columns: [
        { columnId: "a", layoutIndex: 0, column: columns[0]!, offset: 0, width: 450 },
        { columnId: "b", layoutIndex: 1, column: columns[1]!, offset: 450, width: 450 },
      ],
    };
    const state = {
      ...seeded,
      ...applyInstruction(
        { type: "COLUMNS_CHANGED", columns, layout: published, revision: 3 },
        seeded.slots,
        seeded.headers,
      ),
      ...applyInstruction(
        {
          type: "SET_CONTENT_SIZE",
          width: 900,
          height: 3200,
          viewportWidth: 900,
          viewportHeight: 320,
          rowsWrapperOffset: 0,
          revision: 3,
        },
        seeded.slots,
        seeded.headers,
      ),
    };
    expect(state.layout).toBe(published);
    expect(state.geometryRevision).toBe(3);
    expect(state.contentWidth).toBe(900);
    expect(state.viewportWidth).toBe(900);
  });
});
