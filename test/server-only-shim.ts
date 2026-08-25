// Test-only shim: the real "server-only" package unconditionally
// throws (it relies on Next.js's webpack alias to become a no-op in
// a real server bundle — see node_modules/server-only/index.js).
// vitest runs plain Node with no such alias, so every server-only
// module under test needs this swapped in instead (see
// vitest.config.ts's resolve.alias) — this file itself does nothing.
export {}
