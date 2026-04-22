<script setup lang="ts">
import { type CellRendererParams } from "@gp-grid/vue";
const props = defineProps<CellRendererParams>();
const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});
</script>

<template>
    <span>{{ formatter.format(props.value as number) }}</span>
</template>
