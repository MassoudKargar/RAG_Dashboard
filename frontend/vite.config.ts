import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
    root: "/opt/rag-benchmark-dashboard",
    environment: "node",
    include: ["tests/unit/compare.test.ts", "frontend/src/**/*.test.ts"],
  },
});
