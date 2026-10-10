import { createRoot } from "react-dom/client";
import { GridWrapper } from "./GridWrapper";

// Parse row count from URL params
const params = new URLSearchParams(window.location.search);
const rowCount = parseInt(params.get("rows") || "0", 10);
const columnCount = parseInt(params.get("cols") || "10", 10);
const root = createRoot(document.getElementById("root")!);

// No <StrictMode>: its dev-only double-invocation of effects would re-run the
// data load (and thus a full grid re-bind) twice, which disproportionately
// skews grids that materialize data synchronously. Measure a single,
// production-representative bind instead.
if (params.get("groups") === "low") {
  // Loaded on demand so the flat benchmark's entry declares nothing of row grouping.
  void import("./GroupedGridWrapper").then(({ GroupedGridWrapper }) => {
    root.render(<GroupedGridWrapper initialRowCount={rowCount} />);
  });
} else {
  root.render(<GridWrapper initialRowCount={rowCount} columnCount={columnCount} />);
}
