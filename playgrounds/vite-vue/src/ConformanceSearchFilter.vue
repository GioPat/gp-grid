<script setup lang="ts">
import { ref } from "vue";
import type { ColumnFilterModel } from "@gp-grid/vue";

const props = defineProps<{
  apply: (filter: ColumnFilterModel | null) => void;
  close: () => void;
}>();

const text = ref("");

const applyContains = (): void => props.apply({
  groups: [{ conditions: [{ type: "text", operator: "contains", value: text.value }], combination: "and" }],
  combination: "and",
});
</script>

<template>
  <div class="gp-grid-filter-content">
    <input v-model="text" data-testid="custom-filter-input" />
    <button type="button" data-testid="custom-filter-cancel" @click="close">Cancel</button>
    <button type="button" data-testid="custom-filter-apply" @click="applyContains">Apply</button>
  </div>
</template>
