import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { resolveGridLabels } from "@gp-grid/core";
import type { ColumnDefinition, FilterRendererParams } from "@gp-grid/core";
import { FilterPopup } from "../src/components/FilterPopup";
import type { ReactFilterRenderer } from "../src/types";

const labels = resolveGridLabels();

const SearchOnly = ({ apply, close, labels: l }: FilterRendererParams) => {
  const [text, setText] = useState("");
  return (
    <div>
      <input aria-label="search" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={close}>cancel</button>
      <button
        type="button"
        onClick={() => apply({
          groups: [{ conditions: [{ type: "text", operator: "contains", value: text }], combination: "and" }],
          combination: "and",
        })}
      >
        {l.apply}
      </button>
    </div>
  );
};

const renderPopup = (
  column: ColumnDefinition,
  options: { filterRenderers?: Record<string, ReactFilterRenderer>; globalFilterRenderer?: ReactFilterRenderer } = {},
) => {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <FilterPopup
      column={column}
      colIndex={0}
      containerRef={{ current: null }}
      distinctValues={["a", "b"]}
      labels={labels}
      onApply={onApply}
      onClose={onClose}
      {...options}
    />,
  );
  return { onApply, onClose };
};

const textColumn: ColumnDefinition = { field: "name", cellDataType: "text", width: 100 };
const searchOnly: ReactFilterRenderer = { content: SearchOnly, clear: "default" };
const text = (value: string): ReactFilterRenderer => ({ content: () => value, clear: null });

describe("filterRenderer", () => {
  it("replaces the built-in content and applies through the grid", () => {
    const { onApply, onClose } = renderPopup({ ...textColumn, filterRenderer: searchOnly });

    expect(screen.queryByText(labels.selectAll)).toBeNull();
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "ab" } });
    fireEvent.click(screen.getByText(labels.apply));

    expect(onApply).toHaveBeenCalledWith("name", {
      groups: [{ conditions: [{ type: "text", operator: "contains", value: "ab" }], combination: "and" }],
      combination: "and",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without applying", () => {
    const { onApply, onClose } = renderPopup({ ...textColumn, filterRenderer: searchOnly });
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("resolves a registry key before the global renderer", () => {
    renderPopup(
      { ...textColumn, filterRenderer: "custom" },
      { filterRenderers: { custom: text("registry") }, globalFilterRenderer: text("global") },
    );
    expect(screen.getByText("registry")).toBeTruthy();
  });

  it("falls back to the global renderer", () => {
    renderPopup(textColumn, { globalFilterRenderer: text("global") });
    expect(screen.getByText("global")).toBeTruthy();
  });

  it("adds the grid's Clear button for clear: \"default\"", () => {
    const { onApply, onClose } = renderPopup({ ...textColumn, filterRenderer: searchOnly });
    fireEvent.click(screen.getByText(labels.clear));
    expect(onApply).toHaveBeenCalledWith("name", null);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders a custom clear control with its params", () => {
    const { onApply } = renderPopup({
      ...textColumn,
      filterRenderer: {
        content: () => "content",
        clear: ({ clear, hasFilter }) => (
          <button type="button" onClick={clear}>{hasFilter ? "reset" : "nothing to reset"}</button>
        ),
      },
    });
    fireEvent.click(screen.getByText("nothing to reset"));
    expect(onApply).toHaveBeenCalledWith("name", null);
  });

  it("renders no clear control for clear: null", () => {
    renderPopup({ ...textColumn, filterRenderer: text("content") });
    expect(screen.queryByText(labels.clear)).toBeNull();
  });

  it("keeps the built-in content without a renderer", () => {
    renderPopup(textColumn);
    expect(screen.getByText(labels.selectAll)).toBeTruthy();
  });
});
