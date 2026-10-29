<script setup lang="ts">
import { ref } from "vue";
import type { ColumnFilterModel, GridLabels } from "@gp-grid/vue";

const props = defineProps<{
  apply: (filter: ColumnFilterModel | null) => void;
  close: () => void;
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
}>();

const firstCondition = props.currentFilter?.groups[0]?.conditions[0];
const text = ref(firstCondition?.type === "text" ? firstCondition.value ?? "" : "");

const applySearch = (): void => {
  if (text.value.trim() === "") {
    props.apply(null);
    return;
  }
  props.apply({
    groups: [{ conditions: [{ type: "text", operator: "contains", value: text.value }], combination: "and" }],
    combination: "and",
  });
};
</script>

<!-- Search box, cancel and apply only: replaces the built-in filter popup content. -->
<template>
  <div class="gp-grid-filter-content">
    <input
      v-model="text"
      class="gp-grid-filter-search"
      data-testid="custom-filter-input"
      :placeholder="labels.searchPlaceholder"
      autofocus
      @keydown.enter="applySearch"
    />
    <div class="gp-grid-filter-buttons">
      <button type="button" data-testid="custom-filter-cancel" @click="close">Cancel</button>
      <button type="button" class="gp-grid-filter-btn-apply" data-testid="custom-filter-apply" @click="applySearch">
        {{ labels.apply }}
      </button>
    </div>
  </div>
</template>
