// packages/vue/src/composables/useAutoScroll.ts

import { ref, onUnmounted, type Ref } from "vue";
import { readIsRtl, toPhysicalX } from "@gp-grid/core";

const AUTO_SCROLL_INTERVAL = 16; // ~60fps

/**
 * Vue composable for auto-scrolling during drag operations
 */
export function useAutoScroll(
  containerRef: Ref<HTMLDivElement | null>,
  onTick?: () => void,
) {
  const autoScrollInterval = ref<ReturnType<typeof setInterval> | null>(null);

  /**
   * Start auto-scrolling in the given direction
   */
  function startAutoScroll(dx: number, dy: number): void {
    if (autoScrollInterval.value) {
      clearInterval(autoScrollInterval.value);
    }
    // Horizontal deltas are inline-relative; sample the direction once.
    const rtl = readIsRtl(containerRef.value);
    autoScrollInterval.value = setInterval(() => {
      const container = containerRef.value;
      if (container) {
        container.scrollTop += dy;
        container.scrollLeft += toPhysicalX(dx, rtl);
        onTick?.();
      }
    }, AUTO_SCROLL_INTERVAL);
  }

  /**
   * Stop auto-scrolling
   */
  function stopAutoScroll(): void {
    if (autoScrollInterval.value) {
      clearInterval(autoScrollInterval.value);
      autoScrollInterval.value = null;
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopAutoScroll();
  });

  return {
    startAutoScroll,
    stopAutoScroll,
  };
}
