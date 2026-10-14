"use client"

/* ================================================================== *
 * GUEST IMPORT — the missing half of guest mode.
 *
 * /knowledge is deliberately open to visitors (middleware.ts), who get
 * a browser-local library in localStorage (lib/knowledge/guest-store).
 * guest-store's own header said the plan outright: the items "can be
 * exported (exportGuestItems) to migrate into an authenticated account
 * later. No migration is performed now." exportGuestItems had no
 * caller anywhere in the repository.
 *
 * So the moment a visitor signed in, client.ts stopped getting 401s,
 * stopped falling back to the local store, and began reading the
 * account's library — which is empty for a new account. Nothing was
 * deleted; the items were simply no longer anywhere the UI looked.
 * From the reader's side the library emptied itself at the exact
 * moment they did the thing we asked them to do.
 *
 * This offers the move, and only offers it:
 *   - It never runs on its own. Importing is a click.
 *   - It never deletes a local item it did not confirm is in the
 *     account — a failure leaves the local copy exactly where it is.
 *   - Declining dismisses the banner for this tab only. It does not
 *     touch localStorage, so the offer returns and the data stays.
 *
 * It introduces no persistence mechanism: every item goes through the
 * same POST /api/knowledge the Save button uses, so URL validation,
 * the SSRF guard, per-user dedup, rate limiting and owner scoping all
 * apply unchanged. A URL already in the account comes back as a
 * duplicate, which counts as imported — the item is there, which is
 * the only thing the local copy was waiting on.
 * ================================================================== */

import { AlertCircle, Check, Loader2, Upload, X } from "lucide-react"
import { useSession } from "next-auth/react"
import { useCallback, useEffect, useState } from "react"
import { saveUrlToAccount } from "@/lib/knowledge/client"
import { importGuestItems, type GuestImportOutcome } from "@/lib/knowledge/guest-import"
import { exportGuestItems, guestDelete } from "@/lib/knowledge/guest-store"
import { useT } from "./i18n"

/** Dismissal lives in sessionStorage, not localStorage: declining is
 *  "not now", and a later visit should be offered again. It is never
 *  a decision about the data itself. */
const DISMISSED_KEY = "knowledge.guest.import.dismissed.v1"

type Phase = "offer" | "working" | "result"

export function GuestImport() {
  const t = useT()
  const { status } = useSession()
  const [pending, setPending] = useState<{ id: string; url: string }[]>([])
  const [phase, setPhase] = useState<Phase>("offer")
  const [done, setDone] = useState(0)
  const [outcome, setOutcome] = useState<GuestImportOutcome | null>(null)
  const [dismissed, setDismissed] = useState(true)

  /* Read the local library only once a session actually exists. Before
   * that the items are the live library, not a backlog to move. */
  useEffect(() => {
    if (status !== "authenticated") return
    let off = false
    try {
      off = window.sessionStorage.getItem(DISMISSED_KEY) === "1"
    } catch {
      /* private mode — just show the offer */
    }
    setDismissed(off)
    setPending(exportGuestItems().map((doc) => ({ id: doc.id, url: doc.url })))
  }, [status])

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      /* nothing to persist to; the banner still closes for this view */
    }
    setDismissed(true)
  }, [])

  async function runImport() {
    setPhase("working")
    setDone(0)
    // The loop, the ordering and the never-drop-on-failure invariant
    // live in lib/knowledge/guest-import so they can be tested.
    const result = await importGuestItems(pending, {
      save: saveUrlToAccount,
      remove: guestDelete,
      onProgress: setDone,
    })
    setOutcome(result)
    setPhase("result")
    // The library is a separate tree; tell it to re-read from the API.
    if (result.moved > 0) window.dispatchEvent(new Event("knowledge:imported"))
  }

  if (status !== "authenticated") return null
  if (pending.length === 0 && phase === "offer") return null
  if (dismissed && phase === "offer") return null

  return (
    <div className="mx-auto w-full max-w-[var(--pk-measure,52rem)] px-4 pt-4 lg:px-8">
      <div className="flex flex-col gap-3 rounded-[var(--pk-r)] border border-[var(--pk-rule-2)] bg-[var(--pk-raised)] p-4">
        {phase === "offer" && (
          <>
            <div className="flex items-start gap-3">
              <Upload className="mt-0.5 size-4 shrink-0 text-[var(--pk-accent)]" strokeWidth={1.9} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-[var(--pk-ink)]">
                  {pending.length === 1
                    ? t.guestImport.pendingTitle(1)
                    : t.guestImport.pendingTitle(pending.length)}
                </p>
                <p className="pk-meta mt-0.5">
                  {t.guestImport.pendingBody}
                </p>
              </div>
              <button
                onClick={dismiss}
                aria-label={t.account.notNow}
                className="flex size-7 shrink-0 items-center justify-center rounded-[var(--pk-r-sm)] text-[var(--pk-ink-3)] transition-colors hover:bg-[var(--pk-sunken)]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 self-end">
              <button
                onClick={dismiss}
                className="h-9 rounded-[var(--pk-r-sm)] px-3 text-[13px] text-[var(--pk-ink-3)] transition-colors hover:text-[var(--pk-ink)]"
              >{t.guestImport.notNow}</button>
              <button
                onClick={runImport}
                className="h-9 rounded-full bg-[var(--pk-accent)] px-4 text-[13px] font-medium text-[var(--pk-accent-ink)] transition-opacity hover:opacity-90"
              >{t.guestImport.moveToAccount}</button>
            </div>
          </>
        )}

        {phase === "working" && (
          <div className="flex items-center gap-3">
            <Loader2 className="size-4 animate-spin text-[var(--pk-accent)]" />
            <p className="text-[13.5px] text-[var(--pk-ink)]">
              Moving {done} of {pending.length}…
            </p>
          </div>
        )}

        {phase === "result" && outcome && (
          <>
            <div className="flex items-start gap-3">
              {outcome.failed.length === 0 ? (
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--pk-accent)]" strokeWidth={2.4} />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--pk-ink-3)]" strokeWidth={1.9} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-[var(--pk-ink)]">
                  {outcome.moved === 1 ? t.guestImport.moved(1) : t.guestImport.moved(outcome.moved)}
                </p>
                {outcome.failed.length > 0 && (
                  <>
                    {/* Named, not counted. A failure the reader cannot
                        see the reason for is one they cannot act on —
                        and the local copy is still there to retry. */}
                    <p className="pk-meta mt-1">
                      {outcome.failed.length === 1
                        ? t.guestImport.stayed(1)
                        : t.guestImport.stayed(outcome.failed.length)}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {outcome.failed.map((f) => (
                        <li key={f.url} className="pk-meta truncate">
                          <span className="text-[var(--pk-ink-2)]">{f.url}</span> — {f.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-end">
              {outcome.failed.length > 0 && (
                <button
                  onClick={() => {
                    // Retry only what is still local.
                    setPending(exportGuestItems().map((doc) => ({ id: doc.id, url: doc.url })))
                    setOutcome(null)
                    setPhase("offer")
                  }}
                  className="h-9 rounded-[var(--pk-r-sm)] px-3 text-[13px] text-[var(--pk-ink-3)] transition-colors hover:text-[var(--pk-ink)]"
                >
                  {t.common.tryAgain}
                </button>
              )}
              <button
                onClick={dismiss}
                className="h-9 rounded-full bg-[var(--pk-accent)] px-4 text-[13px] font-medium text-[var(--pk-accent-ink)] transition-opacity hover:opacity-90"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
