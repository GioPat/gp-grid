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

describe("filterRenderer", () => {
  it("replaces the built-in content and applies through the grid", () => {
    const { onApply, onClose } = renderPopup({ ...textColumn, filterRenderer: SearchOnly });

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
    const { onApply, onClose } = renderPopup({ ...textColumn, filterRenderer: SearchOnly });
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("resolves a registry key before the global renderer", () => {
    renderPopup(
      { ...textColumn, filterRenderer: "custom" },
      { filterRenderers: { custom: () => "registry" }, globalFilterRenderer: () => "global" },
    );
    expect(screen.getByText("registry")).toBeTruthy();
  });

  it("falls back to the global renderer", () => {
    renderPopup(textColumn, { globalFilterRenderer: () => "global" });
    expect(screen.getByText("global")).toBeTruthy();
  });

  it("keeps the built-in content without a renderer", () => {
    renderPopup(textColumn);
    expect(screen.getByText(labels.selectAll)).toBeTruthy();
  });
});
