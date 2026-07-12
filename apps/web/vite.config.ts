import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    // Dev-only: forward same-origin /api calls to the local API bridge
    // (tools/local-api-server.mjs). No effect on production builds.
    proxy: {
      "/api": {
        target: process.env.HRMS_LOCAL_API_URL ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../../dist/apps/web",
    emptyOutDir: true,
  },
});
