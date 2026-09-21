import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Repo root, resolved relative to this config so the repository works from any clone path.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  test: {
    root: repoRoot,
    environment: "node",
    include: [
      "tests/backend/**/*.test.ts",
      "tests/unit/normalize.test.ts",
      "backend/src/**/*.test.ts",
    ],
    testTimeout: 15000,
  },
});