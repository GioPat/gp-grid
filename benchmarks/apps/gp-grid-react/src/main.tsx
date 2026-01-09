import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GridWrapper } from "./GridWrapper";

// Parse row count from URL params
const params = new URLSearchParams(window.location.search);
const rowCount = parseInt(params.get("rows") || "0", 10);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GridWrapper initialRowCount={rowCount} />
  </StrictMode>
);
