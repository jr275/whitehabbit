// Stub for the "server-only" package under Vitest/plain Node — Next.js's
// own bundler replaces this import with a no-op for server bundles;
// outside that bundler it throws unconditionally by design, so tests
// alias it to this empty module (vitest.config.ts) instead of removing
// the real "server-only" markers from application code.
export {}
