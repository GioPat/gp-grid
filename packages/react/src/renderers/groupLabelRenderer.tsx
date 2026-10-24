// packages/react/src/renderers/groupLabelRenderer.tsx

import React from "react";
import type { GroupLabelRendererParams } from "@gp-grid/core";
import type { ReactGroupLabelRenderer } from "../types";

/** The `groupLabelRenderer` output, or the formatted label. */
export const renderGroupLabel = (
  params: GroupLabelRendererParams,
  renderer?: ReactGroupLabelRenderer,
): React.ReactNode => (renderer === undefined ? params.label : renderer(params));
