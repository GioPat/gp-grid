import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "Core",
      fileName: (format) => `index.${format}.js`,
      formats: ["es", "cjs", "umd"],
    },
  },
  plugins: [
    dts({
      insertTypeEntry: true,
      rollupTypes: true,
    }),
  ],
});
