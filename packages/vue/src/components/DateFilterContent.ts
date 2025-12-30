// packages/vue/src/components/DateFilterContent.ts

import { defineComponent, ref, computed, h, type PropType } from "vue";
import type { ColumnFilterModel, DateFilterCondition, DateFilterOperator } from "gp-grid-core";

const OPERATORS: { value: DateFilterOperator; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "\u2260" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: "between", label: "\u2194" },
  { value: "blank", label: "Is blank" },
  { value: "notBlank", label: "Not blank" },
];

interface Condition {
  operator: DateFilterOperator;
  value: string;
  valueTo: string;
}

// Convert Date to YYYY-MM-DD string for input
function formatDateForInput(date: Date | string | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0]!;
}

export const DateFilterContent = defineComponent({
  name: "DateFilterContent",

  props: {
    currentFilter: {
      type: Object as PropType<ColumnFilterModel>,
      default: undefined,
    },
  },

  emits: ["apply", "close"],

  setup(props, { emit }) {
    const initialConditions = computed((): Condition[] => {
      if (!props.currentFilter?.conditions.length) {
        return [{ operator: "=", value: "", valueTo: "" }];
      }
      return props.currentFilter.conditions.map((c) => {
        const cond = c as DateFilterCondition;
        return {
          operator: cond.operator,
          value: formatDateForInput(cond.value),
          valueTo: formatDateForInput(cond.valueTo),
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
          type: "date" as const,
          operator: c.operator,
          value: c.value || undefined,
          valueTo: c.valueTo || undefined,
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
              updateCondition(index, { operator: (e.target as HTMLSelectElement).value as DateFilterOperator }),
          },
          OPERATORS.map((op) => h("option", { key: op.value, value: op.value }, op.label)),
        ),
      ];

      if (cond.operator !== "blank" && cond.operator !== "notBlank") {
        rowChildren.push(
          h("input", {
            type: "date",
            value: cond.value,
            onInput: (e: Event) => updateCondition(index, { value: (e.target as HTMLInputElement).value }),
          }),
        );
      }

      if (cond.operator === "between") {
        rowChildren.push(h("span", { class: "gp-grid-filter-to" }, "to"));
        rowChildren.push(
          h("input", {
            type: "date",
            value: cond.valueTo,
            onInput: (e: Event) => updateCondition(index, { valueTo: (e.target as HTMLInputElement).value }),
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

    return h("div", { class: "gp-grid-filter-content gp-grid-filter-date" }, children);
  },
});

export default DateFilterContent;
