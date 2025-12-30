// packages/vue/src/components/NumberFilterContent.ts

import { defineComponent, ref, computed, h, type PropType } from "vue";
import type { ColumnFilterModel, NumberFilterCondition, NumberFilterOperator } from "gp-grid-core";

const OPERATORS: { value: NumberFilterOperator; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "\u2260" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: "\u2265" },
  { value: "<=", label: "\u2264" },
  { value: "between", label: "\u2194" },
  { value: "blank", label: "Is blank" },
  { value: "notBlank", label: "Not blank" },
];

interface Condition {
  operator: NumberFilterOperator;
  value: string;
  valueTo: string;
}

export const NumberFilterContent = defineComponent({
  name: "NumberFilterContent",

  props: {
    currentFilter: {
      type: Object as PropType<ColumnFilterModel>,
      default: undefined,
    },
  },

  emits: ["apply", "close"],

  setup(props, { emit }) {
    // Initialize from current filter
    const initialConditions = computed((): Condition[] => {
      if (!props.currentFilter?.conditions.length) {
        return [{ operator: "=", value: "", valueTo: "" }];
      }
      return props.currentFilter.conditions.map((c) => {
        const cond = c as NumberFilterCondition;
        return {
          operator: cond.operator,
          value: cond.value != null ? String(cond.value) : "",
          valueTo: cond.valueTo != null ? String(cond.valueTo) : "",
        };
      });
    });

    const conditions = ref<Condition[]>([...initialConditions.value]);
    const combination = ref<"and" | "or">(props.currentFilter?.combination ?? "and");

    const updateCondition = (index: number, updates: Partial<Condition>): void => {
      const next = [...conditions.value];
      next[index] = { ...next[index]!, ...updates };
      conditions.value = next;
    };

    const addCondition = (): void => {
      conditions.value = [...conditions.value, { operator: "=", value: "", valueTo: "" }];
    };

    const removeCondition = (index: number): void => {
      conditions.value = conditions.value.filter((_, i) => i !== index);
    };

    const handleApply = (): void => {
      const validConditions = conditions.value.filter((c) => {
        if (c.operator === "blank" || c.operator === "notBlank") return true;
        if (c.operator === "between") {
          return c.value !== "" && c.valueTo !== "";
        }
        return c.value !== "";
      });

      if (validConditions.length === 0) {
        emit("apply", null);
        return;
      }

      const filter: ColumnFilterModel = {
        conditions: validConditions.map((c) => ({
          type: "number" as const,
          operator: c.operator,
          value: c.value ? parseFloat(c.value) : undefined,
          valueTo: c.valueTo ? parseFloat(c.valueTo) : undefined,
        })),
        combination: combination.value,
      };
      emit("apply", filter);
    };

    const handleClear = (): void => {
      emit("apply", null);
    };

    return {
      conditions,
      combination,
      updateCondition,
      addCondition,
      removeCondition,
      handleApply,
      handleClear,
    };
  },

  render() {
    const { conditions, combination, updateCondition, addCondition, removeCondition, handleApply, handleClear } = this;

    const children = [];

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
              updateCondition(index, { operator: (e.target as HTMLSelectElement).value as NumberFilterOperator }),
          },
          OPERATORS.map((op) => h("option", { key: op.value, value: op.value }, op.label)),
        ),
      ];

      if (cond.operator !== "blank" && cond.operator !== "notBlank") {
        rowChildren.push(
          h("input", {
            type: "number",
            value: cond.value,
            onInput: (e: Event) => updateCondition(index, { value: (e.target as HTMLInputElement).value }),
            placeholder: "Value",
          }),
        );
      }

      if (cond.operator === "between") {
        rowChildren.push(h("span", { class: "gp-grid-filter-to" }, "to"));
        rowChildren.push(
          h("input", {
            type: "number",
            value: cond.valueTo,
            onInput: (e: Event) => updateCondition(index, { valueTo: (e.target as HTMLInputElement).value }),
            placeholder: "Value",
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
      h("button", { type: "button", class: "gp-grid-filter-add", onClick: addCondition }, "+ Add condition"),
    );

    children.push(
      h("div", { class: "gp-grid-filter-buttons" }, [
        h("button", { type: "button", class: "gp-grid-filter-btn-clear", onClick: handleClear }, "Clear"),
        h("button", { type: "button", class: "gp-grid-filter-btn-apply", onClick: handleApply }, "Apply"),
      ]),
    );

    return h("div", { class: "gp-grid-filter-content gp-grid-filter-number" }, children);
  },
});

export default NumberFilterContent;
