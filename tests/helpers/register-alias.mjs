/* ================================================================== *
 * TEST BOOTSTRAP — loaded via `node --import` before any test module.
 *
 * 1. Registers the module resolution hooks (scripts/
 *    module-alias-hooks.mjs) so tests import application code exactly
 *    as Next.js does — "@/lib/..." and extensionless specifiers.
 *
 * 2. Points DATABASE_URL at a disposable test database BEFORE
 *    lib/db/client.ts reads it at module load. It always OVERRIDES, so
 *    a developer with a real DATABASE_URL in their shell cannot run
 *    the suite against it by accident. tests/helpers/db.ts additionally
 *    refuses to touch a database whose name does not contain "test".
 * ================================================================== */

import { register } from "node:module"

register("../../scripts/module-alias-hooks.mjs", import.meta.url)

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/whitehabbit_test"

process.env.DATABASE_URL = TEST_DATABASE_URL
