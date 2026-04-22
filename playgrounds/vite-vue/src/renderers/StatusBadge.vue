<script setup lang="ts">
import { type CellRendererParams } from "@gp-grid/vue";

const props = defineProps<CellRendererParams>();
</script>

<template>
    <span class="status-badge" :class="`status-badge--${props.value}`">
        {{ String(props.value ?? "").toUpperCase() }}
    </span>
</template>

<style scoped>
.status-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
}
.status-badge--active {
    background-color: #dcfce7;
    color: #166534;
}
.status-badge--inactive {
    background-color: #fee2e2;
    color: #991b1b;
}
.status-badge--pending {
    background-color: #fef3c7;
    color: #92400e;
}
</style>
