/**
 * Scope Ctrl/Cmd+A to the peek overlay's content.
 *
 * Pure CSS (`user-select: none` outside the overlay) only hides the visual
 * highlight — the browser still constructs a Selection range across the whole
 * document, and form controls use a separate selection model that CSS does
 * not affect. This helper intercepts the shortcut, builds a Range covering
 * the overlay node, and installs it as the active Selection so only the
 * overlay's text is highlighted.
 *
 * Returns a cleanup function the caller invokes on unmount.
 * SSR-safe: no-op when `document` is undefined.
 */
export const bindPeekSelectAll = (overlay: HTMLElement): (() => void) => {
  if (typeof document === "undefined") return () => {};

  const handler = (event: KeyboardEvent): void => {
    if (event.key !== "a" && event.key !== "A") return;
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(overlay);
    selection.addRange(range);
  };

  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
};
