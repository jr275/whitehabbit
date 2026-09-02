/* ================================================================== *
 * A minimal browser for a "use client" module under node:test.
 *
 * Import this BEFORE the module under test — ES module imports are
 * evaluated in source order, so this file's side effects run first and
 * the client module finds a window where it expects one. (A dynamic
 * import after an inline setup would also work, but needs top-level
 * await, which this tsconfig's module target does not allow.)
 *
 * Deliberately tiny: only what the guest store actually touches. It is
 * not a DOM, and nothing here should grow into one — a test that needs
 * more than this is testing the wrong layer.
 * ================================================================== */

export class MemoryStorage {
  #data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.#data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.#data.set(key, value)
  }
  removeItem(key: string): void {
    this.#data.delete(key)
  }
  clear(): void {
    this.#data.clear()
  }
}

export const localStorage = new MemoryStorage()

Object.defineProperty(globalThis, "window", {
  value: { localStorage, dispatchEvent: () => true, addEventListener: () => {} },
  configurable: true,
})

/** The guest store's metadata lookup is fire-and-forget and swallows
 *  its own errors; this keeps it from attempting a real request. */
globalThis.fetch = (async () => {
  throw new Error("offline in tests")
}) as typeof fetch
