import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  build: {
    sourcemap: true, // Enable source maps for production builds
  },
  // Ensure source maps work in dev mode
  server: {
    sourcemapIgnoreList: false, // Don't ignore any sources
  },
});
