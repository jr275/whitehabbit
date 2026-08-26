import path from "node:path"
import { defineConfig } from "vitest/config"

/* Minimal Vitest setup — this repo's first test runner (§31/§32
 * mandate real automated tests; none existed before). No extra
 * plugins: the only path resolution these tests need is the same "@/"
 * alias tsconfig.json already defines, configured directly below
 * rather than pulling in vite-tsconfig-paths for one alias.
 *
 * DATABASE_URL defaults to this sandbox's local test database so
 * `pnpm test` works out of the box here; override it for any other
 * environment. LLM_DEV_MODE=true makes the one real LLM call in the
 * content pipeline (the Writer step) deterministic — see
 * lib/agent/tools/llm-providers/development.ts — never a live call to
 * a paid provider from a test run.
 * ================================================================== */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // see tests/setup/server-only-stub.ts
      "server-only": path.resolve(__dirname, "tests/setup/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globalSetup: ["./tests/setup/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/whitehabbit_test",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "test-only-secret-do-not-use-in-production",
      LLM_DEV_MODE: "true",
    },
  },
})
