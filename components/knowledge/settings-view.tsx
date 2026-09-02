"use client"

import { Database, LogIn, LogOut, type LucideIcon, Palette, ShieldCheck, User } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
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
      <PageHeader eyebrow="Settings" title="Your account" subtitle="Manage how Knowledge works for you." />

      <div className="mt-10 max-w-2xl space-y-6">
        {/* Account — real (reflects guest vs. signed-in honestly) */}
        <section className="overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-card">
          <div className="flex items-center gap-4 px-6 py-5">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 font-serif text-lg font-medium text-primary">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-foreground">{name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {isGuest ? "Not signed in — your library is saved on this device" : email || "Signed in"}
              </p>
            </div>
          </div>
          <div className="border-t border-[var(--kn-edge)] px-6 py-4">
            {isGuest ? (
              <Link
                href="/login?callbackUrl=/knowledge"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <LogIn className="size-4" />
                Sign in to save permanently
              </Link>
            ) : (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            )}
          </div>
        </section>

        {/* Everything else — honest, not yet wired */}
        <section className="space-y-3">
          <p className="text-sm font-medium text-primary">Coming soon</p>
          <div className="divide-y divide-[var(--kn-edge)] overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-card">
            <SettingRow
              icon={User}
              title="Profile"
              description="Your display name, avatar and reading preferences."
            />
            <SettingRow
              icon={Palette}
              title="Appearance"
              description="Reading themes, typography and layout density."
            />
            <SettingRow
              icon={ShieldCheck}
              title="Privacy"
              description="Control what Knowledge remembers and how it is used."
            />
            <SettingRow
              icon={Database}
              title="Your data"
              description="Export or permanently delete everything you've saved."
            />
          </div>
        </section>
      </div>
    </PageContainer>
  )
}

function SettingRow({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-[13px] text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] text-muted-foreground">Soon</span>
    </div>
  )
}
