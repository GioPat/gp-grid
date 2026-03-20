import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["html", "lcov"],
      exclude: [...configDefaults.exclude, "playgrounds/**", "benchmarks/**", "**/**.bench.ts", "**/*.config.ts"],
    },
    projects: [
      "packages/core",
      "packages/react",
    ],
  },
});

