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
    // Every integration/e2e test in this suite shares ONE real Postgres
    // database (truncated once at global setup, not per file) and, as of
    // Phase 5A, a real global job queue (lib/workflow/queue.ts's
    // dequeue() is intentionally unscoped — a real worker drains ALL
    // tenants' due jobs). Running test FILES in parallel would let two
    // files race over the same queue rows nondeterministically — a real
    // bug this phase's own step-execution tests surfaced. Test files
    // still run as fast as before (each file's tests still run in one
    // pass), just not interleaved with another file's DB/queue writes.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/whitehabbit_test",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "test-only-secret-do-not-use-in-production",
      LLM_DEV_MODE: "true",
    },
  },
})
