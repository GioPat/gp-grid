import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      exclude: ["playgrounds/**", "benchmarks/**", "**/**.bench.ts", "**/*.config.ts"],
    },
    projects: [
      "packages/core",
      "packages/react",
    ],
  },
});

