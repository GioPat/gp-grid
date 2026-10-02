// packages/react/tests/aria-rows.ts
// D9 row numbering: the header's ARIA rows come first, then the body rows.

/** ARIA rows the header takes: the flat header row, or one row per band. */
export const headerRowCount = (): number =>
  document.querySelectorAll('.gp-grid-header[role="row"], .gp-grid-header > [role="row"]').length;

/** `aria-rowindex` of the body row at `viewIndex`. */
export const bodyAriaRowIndex = (viewIndex: number): number => viewIndex + headerRowCount() + 1;
