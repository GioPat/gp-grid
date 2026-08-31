// packages/react/tests/i18n.test.tsx
// Verifies that the `labels` prop overrides grid chrome labels and filter
// operator labels, and that defaults remain when no override is given.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Grid, type GridProps } from "../src/Grid";
import { NumberFilterContent } from "../src/components/NumberFilterContent";
import { TextFilterContent } from "../src/components/TextFilterContent";
import { resolveGridLabels } from "@gp-grid/core";
import type { ColumnDefinition } from "@gp-grid/core";

interface TestRow {
  id: number;
  name: string;
  age: number;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50 },
  { field: "name", cellDataType: "text", width: 150 },
  { field: "age", cellDataType: "number", width: 80 },
];

function createDefaultProps(
  overrides?: Partial<GridProps<TestRow>>,
): GridProps<TestRow> {
  return {
    columns,
    rowData: [],
    rowHeight: 32,
    ...overrides,
  };
}

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("labels", () => {
  beforeEach(() => {
    global.ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("overrides the empty-state label", async () => {
    render(
      <Grid
        {...createDefaultProps({ labels: { emptyState: "Nessun dato" } })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Nessun dato")).toBeTruthy();
    });
  });

  it("overrides a filter operator label without affecting siblings", () => {
    const labels = resolveGridLabels({ operators: { greaterThan: "Superiore" } });
    render(
      <NumberFilterContent labels={labels} onApply={() => {}} onClose={() => {}} />,
    );

    expect(screen.getByRole("option", { name: "Superiore" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Less than" })).toBeTruthy();
  });

  it("keeps English operator defaults when no override is provided", () => {
    render(
      <NumberFilterContent
        labels={resolveGridLabels()}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("option", { name: "Greater than" })).toBeTruthy();
  });

  it("uses localized condition-group actions", () => {
    const labels = resolveGridLabels({ addGroup: "+ Aggiungi gruppo" });
    render(
      <NumberFilterContent labels={labels} onApply={() => {}} onClose={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "+ Aggiungi gruppo" })).toBeTruthy();
  });

  it("localizes and exposes the selected Values/Condition branch", () => {
    const labels = resolveGridLabels({
      valuesMode: "Scelte",
      conditionMode: "Regole",
      addCondition: "+ Regola",
      addGroup: "+ Gruppo",
      clear: "Azzera",
      apply: "Conferma",
      valuePlaceholder: "Valore personalizzato",
      operators: { contains: "Comprende" },
    });
    render(
      <TextFilterContent
        distinctValues={[]}
        labels={labels}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    const valuesButton = screen.getByRole("button", { name: "Scelte" });
    const conditionButton = screen.getByRole("button", { name: "Regole" });
    expect(valuesButton.getAttribute("aria-pressed")).toBe("true");
    expect(conditionButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(conditionButton);
    expect(valuesButton.getAttribute("aria-pressed")).toBe("false");
    expect(conditionButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("option", { name: "Comprende" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Valore personalizzato")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Regola" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Gruppo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Azzera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Conferma" })).toBeTruthy();
  });
});
