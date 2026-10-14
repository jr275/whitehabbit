"use client"

/* ================================================================== *
 * ACCOUNT CONTROL — the one place the product offers to sign in.
 *
 * It lives here rather than in the rail because the rail is
 * `hidden lg:flex`: below 1024px it does not render at all, and the
 * account block was the rail's only sign-in affordance. /knowledge is
 * deliberately not gated (see middleware.ts) — a visitor lands in
 * guest mode — so a guest on a phone had no route to /login short of
 * typing the URL. The mobile header now renders this too.
 *
 * Two shapes, one behaviour:
 *   "rail"   — the vertical block at the foot of the desktop rail
 *   "header" — a single round control in the mobile header, sized to
 *              match the theme/search/save buttons beside it
 *
 * A guest gets a plain, visible link in both shapes: someone with no
 * account should not have to discover a popover to find out they can
 * make one. The popover is for a signed-in reader, whose email and
 * sign-out are genuinely secondary.
 * ================================================================== */

import { LogIn, LogOut } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { useState } from "react"
import { useT } from "./i18n"

/** Where sign-in returns to, and where signing out lands. Guest work
 *  lives in the browser-local store, so Home is the honest landing
 *  spot in both directions. */
const SIGN_IN_HREF = "/login?callbackUrl=/knowledge/home"
/** Both auth pages read callbackUrl to keep the Keeply identity and to
 *  land the reader back in their library instead of /launch. */
const SIGN_UP_HREF = "/signup?callbackUrl=/knowledge/home"
const SIGN_OUT_OPTS = { callbackUrl: "/login?callbackUrl=/knowledge/home" }

export function AccountControl({ layout }: { layout: "rail" | "header" }) {
  const t = useT()
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)

  const isGuest = status === "unauthenticated"
  const email = session?.user?.email ?? ""
  const name = isGuest ? t.account.guest : session?.user?.name || email.split("@")[0] || t.account.yourAccount
  const initial = (name || "Y").charAt(0).toUpperCase()

  /* ── Guest ───────────────────────────────────────────────────────
     No popover: the offer itself is the affordance. */
  if (isGuest) {
    if (layout === "header") {
      return (
        <Link
          href={SIGN_IN_HREF}
          aria-label={t.common.signIn}
          className="flex size-9 items-center justify-center rounded-full text-[var(--pk-ink-2)] transition-colors active:bg-[var(--pk-sunken)]"
        >
          <LogIn className="size-[18px]" strokeWidth={1.9} />
        </Link>
      )
    }
    return (
      <div className="mb-5">
        <Link
          href={SIGN_IN_HREF}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-[var(--pk-r)] px-2 py-1.5 text-[13px] font-medium text-[var(--pk-accent)] transition-colors hover:bg-[var(--pk-sunken)]"
        >
          <LogIn className="size-4" />
          {t.settings.signInPermanently}
        </Link>
        {/* Creating an account and signing in are different intents,
            and a visitor with a local library has by definition never
            had one. Reaching sign-up only THROUGH a sign-in screen
            makes the common case the indirect one. */}
        <Link
          href={SIGN_UP_HREF}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-[var(--pk-r)] px-2 py-1.5 pl-[2.1rem] text-[13px] text-[var(--pk-ink-3)] transition-colors hover:bg-[var(--pk-sunken)] hover:text-[var(--pk-ink)]"
        >
          {t.account.createAnAccount}
        </Link>
        {/* The disclosure the offer implies but does not state: until
            they sign in, nothing they save leaves this browser. */}
        <p className="pk-meta mt-1 px-0.5">{t.account.savedOnThisDevice}</p>
      </div>
    )
  }

  /* ── Signed in ───────────────────────────────────────────────────
     Identity and sign-out, behind a click in both shapes. */
  const popover = open && (
    <div
      className={
        layout === "header"
          ? "absolute right-0 top-full z-40 mt-1.5 w-56 overflow-hidden rounded-[var(--pk-r)] border border-[var(--pk-rule-2)] bg-[var(--pk-raised)] p-1 shadow-lg shadow-[oklch(0.185_0.022_268_/_6%)]"
          : "absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-[var(--pk-r)] border border-[var(--pk-rule-2)] bg-[var(--pk-raised)] p-1 shadow-lg shadow-[oklch(0.185_0.022_268_/_6%)]"
      }
    >
      <div className="px-2.5 py-2">
        <p className="truncate text-[13px] font-medium text-[var(--pk-ink)]">{name}</p>
        <p className="pk-meta mt-0.5 truncate">{email}</p>
      </div>
      <button
        onClick={() => signOut(SIGN_OUT_OPTS)}
        className="flex w-full items-center gap-2.5 rounded-[var(--pk-r-sm)] px-2.5 py-2 text-[13px] text-[var(--pk-ink-2)] transition-colors hover:bg-[var(--pk-sunken)]"
      >
        <LogOut className="size-4" />
        {t.account.signOutAction}
      </button>
    </div>
  )

  const avatar = (
    <span className="flex size-6 items-center justify-center rounded-full bg-[var(--pk-sunken)] text-[11px] font-medium text-[var(--pk-ink-2)]">
      {initial}
    </span>
  )

  if (layout === "header") {
    return (
      <div className="relative">
        {popover}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t.account.yourAccount}
          className="flex size-9 items-center justify-center rounded-full transition-colors active:bg-[var(--pk-sunken)]"
        >
          {avatar}
        </button>
      </div>
    )
  }

  return (
    <div className="relative mb-5">
      {popover}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-[var(--pk-r)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--pk-sunken)]"
      >
        {avatar}
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--pk-ink-2)]">{name}</span>
      </button>
    </div>
  )
}
