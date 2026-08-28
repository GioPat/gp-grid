// packages/core/tests/global-setup.ts
// Vitest globalSetup: regenerate the git-ignored sort-worker-code.ts so the
// suite never runs against a missing or stale worker bundle.

import { writeSortWorkerModule } from "../scripts/build-worker";

export const setup = async (): Promise<void> => {
  await writeSortWorkerModule();
};
