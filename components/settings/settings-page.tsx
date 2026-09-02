"use client"

/* ================================================================== *
 * SETTINGS — minimal, 100% real. Org name/user email come straight
 * from the session (same cast components/studio/top-nav.tsx already
 * uses for its org pill); Sign out reuses that exact signOut() call
 * verbatim — no second sign-out implementation. Everything below is
 * an explicit, inert Coming-soon list — never a fake settings form
 * for a backend (team members, billing, API keys, security policy)
 * that doesn't exist yet.
 * ================================================================== */

import { LogOut } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"

const COMING_SOON = ["Team members", "Billing", "API keys", "Security"]

export function SettingsPage() {
  const { data: session, status } = useSession()
  const organizationName = (session as { organizationName?: string } | null)?.organizationName
  const email = session?.user?.email

  if (status !== "authenticated") {
    return (
      <div className="mx-auto max-w-[700px] px-5 py-16 text-center sm:px-8">
        <p className="text-[14px] text-muted-foreground">Sign in to manage your account.</p>
        <Link href="/login" className="mt-3 inline-block text-[13px] font-medium text-primary underline">
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[700px] px-5 py-10 sm:px-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Account</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Settings</h1>

      <div className="mt-6 rounded-xl border border-border bg-card">
        <dl className="flex flex-col divide-y divide-border">
          <Row k="Organization" v={organizationName ?? "—"} />
          <Row k="Signed in as" v={email ?? "—"} />
        </dl>
        <div className="border-t border-border px-5 py-3.5">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>

      <h2 className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">More settings — coming soon</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-dashed border-border">
        {COMING_SOON.map((label) => (
          <div key={label} className="flex items-center justify-between border-b border-dashed border-border px-4 py-3 text-[13px] text-muted-foreground last:border-b-0">
            {label}
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <dt className="text-[13px] text-muted-foreground">{k}</dt>
      <dd className="truncate text-right text-[13px] font-medium text-foreground">{v}</dd>
    </div>
  )
}
