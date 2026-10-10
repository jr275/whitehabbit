/* ================================================================== *
 * GUEST IMPORT — moving a browser-local library into an account.
 *
 * WHAT THIS GUARDS. /knowledge is open to visitors, who save into
 * localStorage (lib/knowledge/guest-store). Signing in used to make
 * that library invisible: client.ts stops getting 401s, stops falling
 * back to the local store, and reads the account's library instead —
 * empty for a new account. guest-store's own header said a migration
 * was the plan ("No migration is performed now") and exportGuestItems
 * had no caller.
 *
 * The move is now offered, and the thing that must never go wrong is a
 * DATA-LOSS invariant: an item is removed from the browser only after
 * the account confirms it. These tests drive real failure shapes
 * through the loop and assert what survived.
 *
 * MUTATION-CHECKED, per AGENTS.md §8: move `remove` above `save` in
 * lib/knowledge/guest-import.ts, or move it out of the try, and
 * "keeps the local copy when the save fails" fails.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { importGuestItems, type GuestImportEntry } from "@/lib/knowledge/guest-import"

/** A store that records what was removed, so a test can assert on the
 *  absence of a removal as precisely as on its presence. */
function recorder(entries: GuestImportEntry[]) {
  const remaining = new Map(entries.map((e) => [e.id, e.url]))
  return {
    remaining,
    remove(id: string) {
      if (!remaining.delete(id)) throw new Error(`removed an id that was not there: ${id}`)
    },
  }
}

const ENTRIES: GuestImportEntry[] = [
  { id: "kn_guest_1", url: "https://example.com/one" },
  { id: "kn_guest_2", url: "https://example.com/two" },
  { id: "kn_guest_3", url: "https://example.com/three" },
]

describe("importGuestItems — the happy path", () => {
  it("moves every item and empties the local store", async () => {
    const store = recorder(ENTRIES)
    const result = await importGuestItems(ENTRIES, {
      save: async () => ({ duplicate: false }),
      remove: store.remove,
    })
    assert.equal(result.moved, 3)
    assert.deepEqual(result.failed, [])
    assert.equal(store.remaining.size, 0, "nothing should be left behind on a clean run")
  })

  it("counts a duplicate as moved — the item IS in the account", async () => {
    // A URL already saved to this account comes back 200 + duplicate.
    // The local copy is redundant at that point, which is the only
    // thing the count is about.
    const store = recorder(ENTRIES)
    const result = await importGuestItems(ENTRIES, {
      save: async () => ({ duplicate: true }),
      remove: store.remove,
    })
    assert.equal(result.moved, 3)
    assert.equal(store.remaining.size, 0)
  })

  it("saves sequentially, never in parallel", async () => {
    // Parallel POSTs would spend the shared knowledge_save rate limit
    // and fail the tail of the user's own library.
    let inFlight = 0
    let maxInFlight = 0
    await importGuestItems(ENTRIES, {
      save: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 1))
        inFlight -= 1
      },
      remove: () => {},
    })
    assert.equal(maxInFlight, 1, "only one save may be in flight at a time")
  })
})

describe("importGuestItems — failure never costs data", () => {
  it("keeps the local copy when the save fails", async () => {
    const store = recorder(ENTRIES)
    const result = await importGuestItems(ENTRIES, {
      save: async (url) => {
        if (url.endsWith("/two")) throw new Error("That URL is too long to save.")
        return {}
      },
      remove: store.remove,
    })

    assert.equal(result.moved, 2)
    assert.deepEqual(result.failed, [
      { url: "https://example.com/two", reason: "That URL is too long to save." },
    ])
    // THE INVARIANT: the one that failed is still in the browser.
    assert.deepEqual([...store.remaining.keys()], ["kn_guest_2"])
  })

  it("surfaces the server's real reason, not a generic one", async () => {
    // A reader who cannot see why cannot act on it, and the local copy
    // is still there to retry.
    const store = recorder([ENTRIES[0]])
    const result = await importGuestItems([ENTRIES[0]], {
      save: async () => {
        throw new Error("We couldn't reach that address.")
      },
      remove: store.remove,
    })
    assert.equal(result.failed[0].reason, "We couldn't reach that address.")
  })

  it("keeps going after a failure instead of abandoning the rest", async () => {
    const store = recorder(ENTRIES)
    const result = await importGuestItems(ENTRIES, {
      save: async (url) => {
        if (url.endsWith("/one")) throw new Error("nope")
        return {}
      },
      remove: store.remove,
    })
    assert.equal(result.moved, 2, "a failure on the first item must not stop the other two")
    assert.equal(store.remaining.size, 1)
  })

  it("a session that expires mid-import loses nothing", async () => {
    // saveUrlToAccount has no guest fallback precisely so this surfaces
    // as a failure rather than silently re-saving into the store the
    // import is draining. Everything after the expiry stays local.
    const store = recorder(ENTRIES)
    let calls = 0
    const result = await importGuestItems(ENTRIES, {
      save: async () => {
        calls += 1
        if (calls > 1) throw new Error("Sign in to save to your library.")
        return {}
      },
      remove: store.remove,
    })
    assert.equal(result.moved, 1)
    assert.equal(result.failed.length, 2)
    assert.deepEqual(
      [...store.remaining.keys()],
      ["kn_guest_2", "kn_guest_3"],
      "every item that did not reach the account is still in the browser",
    )
  })

  it("treats a failed local removal as a success, not a failed import", async () => {
    // The item reached the account; that is what the reader asked for.
    // Reporting it as failed would invite a re-import of something
    // already there.
    const result = await importGuestItems([ENTRIES[0]], {
      save: async () => ({}),
      remove: () => {
        throw new Error("localStorage is unavailable")
      },
    })
    assert.equal(result.moved, 1)
    assert.deepEqual(result.failed, [])
  })
})

describe("importGuestItems — progress", () => {
  it("reports every item, including the ones that failed", async () => {
    const seen: number[] = []
    await importGuestItems(ENTRIES, {
      save: async (url) => {
        if (url.endsWith("/two")) throw new Error("nope")
        return {}
      },
      remove: () => {},
      onProgress: (n) => seen.push(n),
    })
    assert.deepEqual(seen, [1, 2, 3], "a stalled counter would read as a hung import")
  })

  it("does nothing, successfully, for an empty library", async () => {
    const result = await importGuestItems([], { save: async () => ({}), remove: () => {} })
    assert.deepEqual(result, { moved: 0, failed: [] })
  })
})

describe("saveUrlToAccount — the no-fallback guarantee", () => {
  it("is the import's save, and has no guest fallback in its source", async () => {
    // An execution test would need the browser env and a fetch stub;
    // what actually matters is structural, and this is the technique
    // the repo already uses for assertions execution cannot make (see
    // google-auth-config.test.ts).
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const source = readFileSync(join(process.cwd(), "lib/knowledge/client.ts"), "utf8")
    const fn = source.slice(source.indexOf("export async function saveUrlToAccount"))
    const body = fn.slice(0, fn.indexOf("\n}\n") + 2)

    assert.ok(body.includes("fetch("), "it must make the real request")
    assert.ok(
      !body.includes("isAuthMiss") && !body.includes("guestSaveUrl") && !body.includes("markGuest"),
      "a 401 here must surface as a failure — falling back would re-save the item into the store the import is draining",
    )
  })
})
