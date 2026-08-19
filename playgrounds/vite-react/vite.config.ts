import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite build --mode profiling` produces a production build meant to be
// profiled (see /profiling): unminified so function names survive, split into
// named chunks so a flamegraph shows which layer a frame belongs to, and using
// the react-dom profiling entry so React's Profiler and its DevTools
// performance tracks are active. Normal dev/build are unaffected.
const profilingBuild = (): UserConfig => ({
  build: {
    sourcemap: true,
    minify: false,
    rolldownOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        advancedChunks: {
          groups: [
            { name: "gp-grid-core", test: /[\\/]packages[\\/]core[\\/]/ },
            { name: "gp-grid-react", test: /[\\/]packages[\\/]react[\\/]/ },
            {
              name: "framework",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: { "react-dom/client": "react-dom/profiling" },
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const profiling = mode === "profiling" ? profilingBuild() : {};
  return {
    plugins: [react()],
    build: {
      sourcemap: true, // Enable source maps for production builds
      ...profiling.build,
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime"],
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      ...profiling.resolve,
    },
    // Ensure source maps work in dev mode
    server: {
      sourcemapIgnoreList: false, // Don't ignore any sources
      allowedHosts: true,
    },
  };
});
