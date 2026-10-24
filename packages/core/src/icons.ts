/** Framework-neutral SVG icon accepted by the grid wrappers. */
export interface GridIcon {
  /** SVG path data rendered with `currentColor`. */
  path: string;
  /** SVG view box. Default: `0 0 24 24`. */
  viewBox?: string;
}

/** Default push-pin icon used by the header pin toggle. */
export const defaultPinIcon: GridIcon = {
  path: "M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2Z",
};
