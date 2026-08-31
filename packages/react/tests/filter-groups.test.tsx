import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { resolveGridLabels } from "@gp-grid/core";
import type { ColumnFilterModel } from "@gp-grid/core";
import { NumberFilterContent } from "../src/components/NumberFilterContent";

const labels = resolveGridLabels();

describe("number filter condition groups", () => {
  it("builds two visibly separate groups with independent combinations", () => {
    const onApply = vi.fn();
    render(
      <NumberFilterContent
        labels={labels}
        onApply={onApply}
        onClose={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: labels.addCondition }));
    const firstGroupInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(firstGroupInputs[1]!, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: labels.or }));

    fireEvent.click(screen.getByRole("button", { name: labels.addGroup }));
    expect(screen.getAllByRole("button", { name: labels.or })).toHaveLength(2);
    const allInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(allInputs[2]!, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: labels.apply }));

    expect(onApply).toHaveBeenCalledWith({
      groups: [
        {
          conditions: [
            { type: "number", operator: "=", value: 10, valueTo: undefined },
            { type: "number", operator: "=", value: 20, valueTo: undefined },
          ],
          combination: "or",
        },
        {
          conditions: [
            { type: "number", operator: "=", value: 30, valueTo: undefined },
          ],
          combination: "and",
        },
      ],
      combination: "and",
    });
  });

  it("reopens a grouped filter without flattening its structure", () => {
    const currentFilter: ColumnFilterModel = {
      groups: [
        {
          conditions: [
            { type: "number", operator: ">", value: 10 },
            { type: "number", operator: "<", value: 20 },
          ],
          combination: "and",
        },
        {
          conditions: [{ type: "number", operator: "=", value: 100 }],
          combination: "and",
        },
      ],
      combination: "or",
    };
    const { container } = render(
      <NumberFilterContent
        currentFilter={currentFilter}
        labels={labels}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    const groupCards = container.querySelectorAll(".gp-grid-filter-group");
    expect(groupCards).toHaveLength(2);
    expect(screen.getAllByRole("spinbutton").map((input) =>
      (input as HTMLInputElement).value)).toEqual(["10", "20", "100"]);
    expect(container.querySelector(
      ".gp-grid-filter-groups > .gp-grid-filter-combination .active",
    )?.textContent).toBe(labels.or);
    expect(groupCards[0]?.querySelector(
      ".gp-grid-filter-combination .active",
    )?.textContent).toBe(labels.and);
    expect(groupCards[1]?.querySelector(
      ".gp-grid-filter-combination",
    )).toBeNull();
  });

  it("drops incomplete conditions and empty groups on apply", () => {
    const onApply = vi.fn();
    render(
      <NumberFilterContent
        labels={labels}
        onApply={onApply}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: labels.addGroup }));
    fireEvent.click(screen.getByRole("button", { name: labels.apply }));

    expect(onApply).toHaveBeenCalledWith({
      groups: [{
        conditions: [
          { type: "number", operator: "=", value: 5, valueTo: undefined },
        ],
        combination: "and",
      }],
      combination: "and",
    });
  });

  it("keeps condition operators independent within a group", () => {
    render(
      <NumberFilterContent
        labels={labels}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: labels.addCondition }));
    fireEvent.click(screen.getByRole("button", { name: labels.addCondition }));

    const operators = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(operators[1]!, { target: { value: ">" } });

    expect(operators.map((operator) => operator.value)).toEqual(["=", ">", "="]);
    expect(screen.getAllByRole("button", { name: labels.or })).toHaveLength(1);
  });
});
