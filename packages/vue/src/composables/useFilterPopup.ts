// packages/vue/src/composables/useFilterPopup.ts

import { onMounted, onUnmounted, type Ref } from "vue";

export interface UseFilterPopupOptions {
  onClose: () => void;
  ignoreSelector?: string;
}

/**
 * Composable for filter popup behavior.
 * Handles click-outside detection and escape key to close the popup.
 */
export function useFilterPopup(
  popupRef: Ref<HTMLElement | null>,
  options: UseFilterPopupOptions,
): void {
  const { onClose, ignoreSelector = ".gp-grid-filter-icon" } = options;

  let handleClickOutside: ((e: MouseEvent) => void) | null = null;
  let handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

  onMounted(() => {
    handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      // Ignore clicks on filter icons
      if (ignoreSelector && target.closest(ignoreSelector)) {
        return;
      }
      if (popupRef.value && !popupRef.value.contains(target)) {
        onClose();
      }
    };

    handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Add listeners after a frame to avoid immediate close
    requestAnimationFrame(() => {
      if (handleClickOutside) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      if (handleKeyDown) {
        document.addEventListener("keydown", handleKeyDown);
      }
    });
  });

  onUnmounted(() => {
    if (handleClickOutside) {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    if (handleKeyDown) {
      document.removeEventListener("keydown", handleKeyDown);
    }
  });
}
