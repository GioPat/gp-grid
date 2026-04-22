<script setup lang="ts">
import { type CellRendererParams } from "@gp-grid/vue";

const props = defineProps<CellRendererParams>();
</script>

<template>
    <strong>{{ String(props.value ?? "") }}</strong>
</template>
