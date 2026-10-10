/* ================================================================== *
 * GUEST IMPORT — the move itself, with no React and no network.
 *
 * This is deliberately a plain module rather than logic inside the
 * banner component. The invariant that matters here is a data-loss
 * invariant — "never drop the local copy of something that did not
 * reach the account" — and an invariant worth stating is worth a test
 * that fails when it breaks. A loop inside a "use client" component
 * cannot have one in this repository's plain-Node test runner.
 *
 * Both effects are injected, so a test drives real failure shapes
 * (a rejected save, a mid-run 401) and asserts what survived.
 * ================================================================== */

export interface GuestImportEntry {
  id: string
  url: string
}

export interface GuestImportFailure {
  url: string
  reason: string
}

export interface GuestImportOutcome {
  /** Reached the account — newly created OR already there. Both mean
   *  the local copy is now redundant, which is the only question this
   *  count answers. */
  moved: number
  /** Still local, each with the real reason, so the reader can act on
   *  it and retry. */
  failed: GuestImportFailure[]
}

export interface GuestImportDeps {
  /** Must NOT fall back to the guest store on 401 — see
   *  client.ts's saveUrlToAccount for why that would be circular. */
  save: (url: string) => Promise<unknown>
  /** Removes one item from the browser-local store. */
  remove: (id: string) => void
  onProgress?: (done: number) => void
}

function reasonFrom(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return "Couldn't reach the server."
}

/**
 * Move each entry into the account, one at a time.
 *
 * SEQUENTIAL ON PURPOSE. These spend the same `knowledge_save` rate
 * limit as any other save (app/api/knowledge/route.ts). Firing a
 * library's worth of POSTs in parallel would exhaust the budget and
 * fail the tail of the user's own items — a self-inflicted outage
 * reported to them as their links failing.
 *
 * THE ORDER INSIDE THE LOOP IS THE SAFETY PROPERTY. The local copy is
 * removed only after `save` resolves. A rejection leaves it untouched,
 * so a failed or interrupted import loses nothing and can simply be
 * run again. A failure to remove it afterwards is not an import
 * failure: the item IS in the account at that point, which is what the
 * reader asked for.
 */
export async function importGuestItems(
  entries: readonly GuestImportEntry[],
  deps: GuestImportDeps,
): Promise<GuestImportOutcome> {
  const failed: GuestImportFailure[] = []
  let moved = 0
  let done = 0

  for (const entry of entries) {
    try {
      await deps.save(entry.url)
      moved += 1
      try {
        deps.remove(entry.id)
      } catch {
        /* Already gone locally, or storage is unavailable. The account
         * copy exists either way, so this is not a failed import. */
      }
    } catch (err) {
      failed.push({ url: entry.url, reason: reasonFrom(err) })
    }
    done += 1
    deps.onProgress?.(done)
  }

  return { moved, failed }
}
