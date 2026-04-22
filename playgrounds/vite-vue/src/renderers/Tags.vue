<script setup lang="ts">
import { computed } from "vue";
import { type CellRendererParams } from "@gp-grid/vue";

const props = defineProps<CellRendererParams>();

const tags = computed<string[]>(() => (props.value as string[]) ?? []);
</script>

<template>
    <span v-if="tags.length === 0" class="tags-empty">No tags</span>
    <div v-else class="tags-list">
        <span v-for="tag in tags" :key="tag" class="tag">
            {{ tag.toUpperCase() }}
        </span>
    </div>
</template>

<style scoped>
.tags-empty {
    color: #6b7280;
    font-style: italic;
}
.tags-list {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    max-height: 100%;
    overflow-y: auto;
    align-content: flex-start;
    padding: 2px 0;
}
.tag {
    background-color: #3b82f6;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    flex-shrink: 0;
}
</style>
