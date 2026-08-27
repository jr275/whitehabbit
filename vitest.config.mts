import path from "node:path"
import { defineConfig } from "vitest/config"

const root = import.meta.dirname

// Mirrors tsconfig.json's "@/*" path alias — the only bundler config
// these tests need, since vitest handles TS/ESM natively.
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // The real package unconditionally throws unless bundled with
      // Next's "react-server" export condition (see node_modules/
      // server-only/package.json) — tests run in plain Node, so this
      // points every "server-only" import at its own no-op twin
      // instead. This changes nothing about the real app: Next's own
      // build still resolves the real, throwing package everywhere
      // else.
      "server-only": path.join(root, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
})
