import { defineConfig } from "vitest/config"
import path from "node:path"

/* Tests run in Node, not in a React Server Component context, so the
 * `server-only` guard that protects lib/db and lib/pocket2 from being
 * imported client-side would throw here. Aliasing it to a no-op keeps
 * that guard fully active in the real build (where it matters) while
 * letting the same modules be tested directly. */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/support/server-only-stub.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    // Integration tests share one Postgres database; running files in
    // parallel would let one file's truncation delete another's rows.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
