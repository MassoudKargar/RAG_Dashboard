import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Repo root, resolved relative to this config so the repository works from any clone path.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 60,
    rollupOptions: {
      output: {
        // Split into smaller chunks so no single asset exceeds the CDN's
        // large-body pass-through limit observed on this deployment (~114KB),
        // which caused a blank page (truncated JS bundle).
        manualChunks: {
          react: ["react", "react-dom"],
          admin: ["./src/admin/AdminConsole.tsx", "./src/admin/Documents.tsx"],
          features: ["./src/features/SummarySection.tsx", "./src/features/ComparisonSection.tsx", "./src/features/HistorySection.tsx"],
          lib: ["./src/lib/compare.ts", "./src/lib/metrics.ts", "./src/lib/format.ts"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4173",
        changeOrigin: false,
      },
    },
  },
  test: {
    root: repoRoot,
    environment: "node",
    include: ["tests/unit/compare.test.ts", "frontend/src/**/*.test.ts"],
  },
});
