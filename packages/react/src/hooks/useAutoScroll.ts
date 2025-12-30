// packages/react/src/hooks/useAutoScroll.ts

import { useRef, useCallback } from "react";

// Auto-scroll configuration
const SCROLL_THRESHOLD = 40; // pixels from edge to trigger scroll
const SCROLL_SPEED = 10; // pixels per frame
const SCROLL_INTERVAL = 16; // ~60fps

export interface AutoScrollResult {
  /** Start auto-scrolling based on mouse position in container */
  updateAutoScroll: (
    mouseYInContainer: number,
    mouseXInContainer: number,
    containerHeight: number,
    containerWidth: number,
    headerHeight: number,
    container: HTMLElement,
  ) => void;
  /** Stop auto-scrolling and clear interval */
  stopAutoScroll: () => void;
}

/**
 * Hook for managing auto-scroll behavior during drag operations
 */
export function useAutoScroll(): AutoScrollResult {
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  const updateAutoScroll = useCallback(
    (
      mouseYInContainer: number,
      mouseXInContainer: number,
      containerHeight: number,
      containerWidth: number,
      headerHeight: number,
      container: HTMLElement,
    ) => {
      // Clear any existing auto-scroll
      stopAutoScroll();

      // Check if we need to auto-scroll
      let scrollDeltaX = 0;
      let scrollDeltaY = 0;

      // Vertical scrolling
      if (mouseYInContainer < SCROLL_THRESHOLD + headerHeight) {
        scrollDeltaY = -SCROLL_SPEED;
      } else if (mouseYInContainer > containerHeight - SCROLL_THRESHOLD) {
        scrollDeltaY = SCROLL_SPEED;
      }

      // Horizontal scrolling
      if (mouseXInContainer < SCROLL_THRESHOLD) {
        scrollDeltaX = -SCROLL_SPEED;
      } else if (mouseXInContainer > containerWidth - SCROLL_THRESHOLD) {
        scrollDeltaX = SCROLL_SPEED;
      }

      // Start auto-scroll if needed
      if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
        autoScrollIntervalRef.current = setInterval(() => {
          container.scrollTop += scrollDeltaY;
          container.scrollLeft += scrollDeltaX;
        }, SCROLL_INTERVAL);
      }
    },
    [stopAutoScroll],
  );

  return { updateAutoScroll, stopAutoScroll };
}
