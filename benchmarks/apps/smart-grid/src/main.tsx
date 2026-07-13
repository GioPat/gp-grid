import { createRoot } from "react-dom/client";
import { GridWrapper } from "./GridWrapper";

const params = new URLSearchParams(window.location.search);
const rowCount = Number.parseInt(params.get("rows") ?? "0", 10);

// No <StrictMode>: its dev-only double-invocation of effects would re-run the
// data load (and thus a full grid re-bind) twice, which disproportionately
// skews grids that materialize data synchronously. Measure a single,
// production-representative bind instead.
createRoot(document.getElementById("root")!).render(
  <GridWrapper initialRowCount={rowCount} />,
);
