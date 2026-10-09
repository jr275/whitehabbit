"use client"

import { LogIn, LogOut } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { IndexingPanel } from "./indexing-panel"
import { PageContainer, PageHeader } from "./page-header"

/** Settings for the standalone Knowledge product. The account section is
 *  real — it reflects the signed-in user and can sign them out. The
 *  remaining sections are honest "coming soon" rows: they describe what
 *  will live here without fabricating controls that do nothing. No
 *  underlying platform/organization architecture is exposed. */
export function SettingsView() {
  const { data: session, status } = useSession()
  const isGuest = status === "unauthenticated"
  const email = session?.user?.email ?? ""
  const name = isGuest ? "Guest" : session?.user?.name || email.split("@")[0] || "Your account"
  const initial = (name || "Y").charAt(0).toUpperCase()

  return (
    <PageContainer>
      <PageHeader eyebrow="Settings" title="Your account" subtitle="Manage how Keeply works for you." />

      <div className="mt-12 max-w-[34rem]">
        {/* Account — real (reflects guest vs. signed-in honestly) */}
        <section className="border-t border-[var(--pk-rule)] py-6">
          <p className="pk-label mb-4">Signed in as</p>
          <div className="flex items-center gap-3.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-[var(--pk-sunken)] text-[13px] font-medium text-[var(--pk-ink-2)]">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-[var(--pk-ink)]">{name}</p>
              <p className="pk-meta truncate">
                {isGuest ? "Not signed in — your library is saved on this device" : email || "Signed in"}
              </p>
            </div>
          </div>
          {isGuest ? (
            <Link
              href="/login?callbackUrl=/knowledge/home"
              className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--pk-accent)] px-5 text-[13.5px] font-medium text-[var(--pk-accent-ink)] transition-opacity hover:opacity-90"
            >
              <LogIn className="size-4" />
              Sign in to save permanently
            </Link>
          ) : (
            <button
              onClick={() => signOut({ callbackUrl: "/login?callbackUrl=/knowledge/home" })}
              className="mt-5 inline-flex items-center gap-1.5 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          )}
        </section>

        {/* The one operational answer the product owes a signed-in
            reader: has their library been read, and if not, why not.
            Guests have no server-side library to report on. */}
        {!isGuest && <IndexingPanel />}

        {/* Everything else — honest, not yet wired. Rows, not a bordered
            card of icon tiles with a "Soon" pill on each: four pills in
            a column is four times the announcement one line makes, and
            the icons were decoration for labels that already read. */}
        <section className="mt-6">
          <p className="pk-label mb-1">Not built yet</p>
          <ul className="pk-rows">
            <SettingRow title="Profile" description="Your display name, avatar and reading preferences." />
            <SettingRow title="Appearance" description="Reading themes, typography and layout density." />
            <SettingRow title="Privacy" description="Control what Keeply remembers and how it is used." />
            <SettingRow title="Your data" description="Export or permanently delete everything you've saved." />
          </ul>
        </section>
      </div>
    </PageContainer>
  )
}

function SettingRow({ title, description }: { title: string; description: string }) {
  return (
    <li className="border-b border-[var(--pk-rule)] py-4">
      <p className="text-[15px] text-[var(--pk-ink-3)]">{title}</p>
      <p className="pk-meta mt-1">{description}</p>
    </li>
  )
}
