<script setup lang="ts">
import { computed } from "vue";
import { type CellRendererParams } from "@gp-grid/vue";

const props = defineProps<CellRendererParams>();

const rawAge = computed<number | null>(() => {
    const row = props.rowData as { age?: unknown } | null;
    const value = row?.age;
    const age = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(age)) return age;
    return null;
});

const bucketClass = computed(() => {
    const age = rawAge.value;
    if (age === null) return "age-bucket--unknown";
    if (age < 25) return "age-bucket--young";
    if (age < 40) return "age-bucket--early";
    if (age < 60) return "age-bucket--mid";
    return "age-bucket--senior";
});
</script>

<template>
    <div class="age-bucket" :class="bucketClass">
        <span class="age-bucket__value">{{ props.value }}</span>
        <span v-if="rawAge !== null" class="age-bucket__raw">{{ rawAge }}</span>
    </div>
</template>

<style scoped>
.age-bucket {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
}

.age-bucket__raw {
    color: currentColor;
    font-weight: 500;
    opacity: 0.7;
}

.age-bucket--young {
    background-color: #dbeafe;
    color: #1e40af;
}

.age-bucket--early {
    background-color: #dcfce7;
    color: #166534;
}

.age-bucket--mid {
    background-color: #fef3c7;
    color: #92400e;
}

.age-bucket--senior {
    background-color: #fee2e2;
    color: #991b1b;
}

.age-bucket--unknown {
    background-color: #f3f4f6;
    color: #374151;
}
</style>
