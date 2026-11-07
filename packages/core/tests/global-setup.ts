// packages/core/tests/global-setup.ts
// Vitest globalSetup: regenerate the git-ignored sort-worker-code.ts and
// grid-styles.ts so the suite never runs against missing or stale artifacts.

import { writeSortWorkerModule } from "../scripts/build-worker";
import { writeStylesModule } from "../scripts/build-styles";

export const setup = async (): Promise<void> => {
  await writeSortWorkerModule();
  writeStylesModule();
};
