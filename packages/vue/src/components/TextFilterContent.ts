// packages/vue/src/components/TextFilterContent.ts

import { defineComponent, ref, computed, h, type PropType } from "vue";
import type { CellValue, ColumnFilterModel, TextFilterCondition, TextFilterOperator } from "gp-grid-core";

const MAX_VALUES_FOR_LIST = 100;

const OPERATORS: { value: TextFilterOperator; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "notContains", label: "Does not contain" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does not equal" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "blank", label: "Is blank" },
  { value: "notBlank", label: "Is not blank" },
];

interface Condition {
  operator: TextFilterOperator;
  value: string;
}

type FilterMode = "values" | "condition";

export const TextFilterContent = defineComponent({
  name: "TextFilterContent",

  props: {
    distinctValues: {
      type: Array as PropType<CellValue[]>,
      required: true,
    },
    currentFilter: {
      type: Object as PropType<ColumnFilterModel>,
      default: undefined,
    },
  },

  emits: ["apply", "close"],

  setup(props, { emit }) {
    // Helper to convert value to display string
    const valueToString = (v: CellValue): string => {
      if (Array.isArray(v)) {
        return v.join(", ");
      }
      return String(v ?? "");
    };

    // Computed unique values
    const uniqueValues = computed(() => {
      const values = props.distinctValues
        .filter((v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
        .map((v) => valueToString(v));
      return Array.from(new Set(values)).sort((a, b) => {
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      });
    });

    const hasTooManyValues = computed(() => uniqueValues.value.length > MAX_VALUES_FOR_LIST);

    // Detect initial mode from existing filter
    const initialMode = computed((): FilterMode => {
      if (!props.currentFilter?.conditions[0]) {
        return hasTooManyValues.value ? "condition" : "values";
      }
      const cond = props.currentFilter.conditions[0] as TextFilterCondition;
      if (cond.selectedValues && cond.selectedValues.size > 0) {
        return "values";
      }
      return "condition";
    });

    const mode = ref<FilterMode>(initialMode.value);

    // ============= VALUES MODE STATE =============
    const initialSelected = computed(() => {
      if (!props.currentFilter?.conditions[0]) return new Set<string>();
      const cond = props.currentFilter.conditions[0] as TextFilterCondition;
      return cond.selectedValues ?? new Set<string>();
    });

    const initialIncludeBlanks = computed(() => {
      if (!props.currentFilter?.conditions[0]) return true;
      const cond = props.currentFilter.conditions[0] as TextFilterCondition;
      return cond.includeBlank ?? true;
    });

    const searchText = ref("");
    const selectedValues = ref<Set<string>>(new Set(initialSelected.value));
    const includeBlanks = ref(initialIncludeBlanks.value);

    // ============= CONDITION MODE STATE =============
    const initialConditions = computed((): Condition[] => {
      if (!props.currentFilter?.conditions.length) {
        return [{ operator: "contains", value: "" }];
      }
      const cond = props.currentFilter.conditions[0] as TextFilterCondition;
      if (cond.selectedValues && cond.selectedValues.size > 0) {
        return [{ operator: "contains", value: "" }];
      }
      return props.currentFilter.conditions.map((c) => {
        const tc = c as TextFilterCondition;
        return {
          operator: tc.operator,
          value: tc.value ?? "",
        };
      });
    });

    const conditions = ref<Condition[]>([...initialConditions.value]);
    const combination = ref<"and" | "or">(props.currentFilter?.combination ?? "and");

    // ============= VALUES MODE LOGIC =============
    const displayValues = computed(() => {
      if (!searchText.value) return uniqueValues.value;
      const lower = searchText.value.toLowerCase();
      return uniqueValues.value.filter((v) => v.toLowerCase().includes(lower));
    });

    const hasBlanks = computed(() => {
      return props.distinctValues.some((v) => v == null || v === "");
    });

    const allSelected = computed(() => {
      const allNonBlank = displayValues.value.every((v) => selectedValues.value.has(v));
      return allNonBlank && (!hasBlanks.value || includeBlanks.value);
    });

    const handleSelectAll = (): void => {
      selectedValues.value = new Set(displayValues.value);
      if (hasBlanks.value) includeBlanks.value = true;
    };

    const handleDeselectAll = (): void => {
      selectedValues.value = new Set();
      includeBlanks.value = false;
    };

    const handleValueToggle = (value: string): void => {
      const next = new Set(selectedValues.value);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      selectedValues.value = next;
    };

    // ============= CONDITION MODE LOGIC =============
    const updateCondition = (index: number, updates: Partial<Condition>): void => {
      const next = [...conditions.value];
      next[index] = { ...next[index]!, ...updates };
      conditions.value = next;
    };

    const addCondition = (): void => {
      conditions.value = [...conditions.value, { operator: "contains", value: "" }];
    };

    const removeCondition = (index: number): void => {
      conditions.value = conditions.value.filter((_, i) => i !== index);
    };

    // ============= APPLY LOGIC =============
    const handleApply = (): void => {
      if (mode.value === "values") {
        const allNonBlankSelected = uniqueValues.value.every((v) => selectedValues.value.has(v));
        const isAllSelected = allNonBlankSelected && (!hasBlanks.value || includeBlanks.value);

        if (isAllSelected) {
          emit("apply", null);
          return;
        }

        const filter: ColumnFilterModel = {
          conditions: [
            {
              type: "text",
              operator: "equals",
              selectedValues: selectedValues.value,
              includeBlank: includeBlanks.value,
            },
          ],
          combination: "and",
        };
        emit("apply", filter);
      } else {
        const validConditions = conditions.value.filter((c) => {
          if (c.operator === "blank" || c.operator === "notBlank") return true;
          return c.value.trim() !== "";
        });

        if (validConditions.length === 0) {
          emit("apply", null);
          return;
        }

        const filter: ColumnFilterModel = {
          conditions: validConditions.map((c) => ({
            type: "text" as const,
            operator: c.operator,
            value: c.value,
          })),
          combination: combination.value,
        };
        emit("apply", filter);
      }
    };

    const handleClear = (): void => {
      emit("apply", null);
    };

    return {
      mode,
      searchText,
      selectedValues,
      includeBlanks,
      conditions,
      combination,
      uniqueValues,
      displayValues,
      hasBlanks,
      allSelected,
      hasTooManyValues,
      handleSelectAll,
      handleDeselectAll,
      handleValueToggle,
      updateCondition,
      addCondition,
      removeCondition,
      handleApply,
      handleClear,
    };
  },

  render() {
    const {
      mode,
      searchText,
      selectedValues,
      includeBlanks,
      conditions,
      combination,
      displayValues,
      hasBlanks,
      allSelected,
      hasTooManyValues,
      uniqueValues,
      handleSelectAll,
      handleDeselectAll,
      handleValueToggle,
      updateCondition,
      addCondition,
      removeCondition,
      handleApply,
      handleClear,
    } = this;

    const children = [];

    // Mode toggle - only show if not too many values
    if (!hasTooManyValues) {
      children.push(
        h("div", { class: "gp-grid-filter-mode-toggle" }, [
          h(
            "button",
            {
              type: "button",
              class: mode === "values" ? "active" : "",
              onClick: () => (this.mode = "values"),
            },
            "Values",
          ),
          h(
            "button",
            {
              type: "button",
              class: mode === "condition" ? "active" : "",
              onClick: () => (this.mode = "condition"),
            },
            "Condition",
          ),
        ]),
      );
    }

    // Too many values message
    if (hasTooManyValues && mode === "condition") {
      children.push(
        h(
          "div",
          { class: "gp-grid-filter-info" },
          `Too many unique values (${uniqueValues.length}). Use conditions to filter.`,
        ),
      );
    }

    // VALUES MODE
    if (mode === "values") {
      // Search input
      children.push(
        h("input", {
          class: "gp-grid-filter-search",
          type: "text",
          placeholder: "Search...",
          value: searchText,
          onInput: (e: Event) => (this.searchText = (e.target as HTMLInputElement).value),
          autofocus: true,
        }),
      );

      // Select all / Deselect all
      children.push(
        h("div", { class: "gp-grid-filter-actions" }, [
          h(
            "button",
            { type: "button", onClick: handleSelectAll, disabled: allSelected },
            "Select All",
          ),
          h("button", { type: "button", onClick: handleDeselectAll }, "Deselect All"),
        ]),
      );

      // Checkbox list
      const listChildren = [];

      // Blanks option
      if (hasBlanks) {
        listChildren.push(
          h("label", { class: "gp-grid-filter-option" }, [
            h("input", {
              type: "checkbox",
              checked: includeBlanks,
              onChange: () => (this.includeBlanks = !includeBlanks),
            }),
            h("span", { class: "gp-grid-filter-blank" }, "(Blanks)"),
          ]),
        );
      }

      // Values
      for (const value of displayValues) {
        listChildren.push(
          h("label", { key: value, class: "gp-grid-filter-option" }, [
            h("input", {
              type: "checkbox",
              checked: selectedValues.has(value),
              onChange: () => handleValueToggle(value),
            }),
            h("span", null, value),
          ]),
        );
      }

      children.push(h("div", { class: "gp-grid-filter-list" }, listChildren));
    }

    // CONDITION MODE
    if (mode === "condition") {
      for (let index = 0; index < conditions.length; index++) {
        const cond = conditions[index]!;
        const condChildren = [];

        if (index > 0) {
          condChildren.push(
            h("div", { class: "gp-grid-filter-combination" }, [
              h(
                "button",
                {
                  type: "button",
                  class: combination === "and" ? "active" : "",
                  onClick: () => (this.combination = "and"),
                },
                "AND",
              ),
              h(
                "button",
                {
                  type: "button",
                  class: combination === "or" ? "active" : "",
                  onClick: () => (this.combination = "or"),
                },
                "OR",
              ),
            ]),
          );
        }

        const rowChildren = [
          h(
            "select",
            {
              value: cond.operator,
              onChange: (e: Event) =>
                updateCondition(index, { operator: (e.target as HTMLSelectElement).value as TextFilterOperator }),
              autofocus: index === 0,
            },
            OPERATORS.map((op) =>
              h("option", { key: op.value, value: op.value }, op.label),
            ),
          ),
        ];

        if (cond.operator !== "blank" && cond.operator !== "notBlank") {
          rowChildren.push(
            h("input", {
              type: "text",
              value: cond.value,
              onInput: (e: Event) =>
                updateCondition(index, { value: (e.target as HTMLInputElement).value }),
              placeholder: "Value",
              class: "gp-grid-filter-text-input",
            }),
          );
        }

        if (conditions.length > 1) {
          rowChildren.push(
            h(
              "button",
              {
                type: "button",
                class: "gp-grid-filter-remove",
                onClick: () => removeCondition(index),
              },
              "×",
            ),
          );
        }

        condChildren.push(h("div", { class: "gp-grid-filter-row" }, rowChildren));
        children.push(h("div", { key: index, class: "gp-grid-filter-condition" }, condChildren));
      }

      children.push(
        h(
          "button",
          { type: "button", class: "gp-grid-filter-add", onClick: addCondition },
          "+ Add condition",
        ),
      );
    }

    // Apply / Clear buttons
    children.push(
      h("div", { class: "gp-grid-filter-buttons" }, [
        h(
          "button",
          { type: "button", class: "gp-grid-filter-btn-clear", onClick: handleClear },
          "Clear",
        ),
        h(
          "button",
          { type: "button", class: "gp-grid-filter-btn-apply", onClick: handleApply },
          "Apply",
        ),
      ]),
    );

    return h("div", { class: "gp-grid-filter-content gp-grid-filter-text" }, children);
  },
});

export default TextFilterContent;
