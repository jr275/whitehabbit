import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // Real server-only modules import "server-only", which
      // unconditionally throws outside Next.js's own webpack bundling
      // (see node_modules/server-only/index.js) — swapped for a no-op
      // here so the REAL module code under test can be imported
      // directly, unmodified, exactly as it ships.
      "server-only": path.resolve(dirname, "test/server-only-shim.ts"),
      "@": path.resolve(dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
