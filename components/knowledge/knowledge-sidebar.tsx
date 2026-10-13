"use client"

/* ================================================================== *
 * THE RAIL — Keeply's only navigation surface.
 *
 * It replaces a sidebar AND a top bar. The top bar carried a context
 * label that every page already states in its own H1, a second search
 * field, and a Save button — three things that existed twice, framing
 * every screen in two bands of chrome before any content began.
 *
 * Three tiers, deliberately unequal (a flat list of equals is what
 * made this read as an admin panel):
 *   1. Search and Ask — the two doors into the knowledge itself
 *   2. the browse list — where to go when you have no question yet
 *   3. saved filters, settings, account — quiet, at the bottom
 *
 * The rail sits on the page's own ground with no fill and no border:
 * a filled sidebar is a second surface, and the eye reads two surfaces
 * as two applications. A one-pixel rule is enough to say "this column
 * is not the page".
 *
 * This is Knowledge's navigation and nothing else's. Workforce has its
 * own shell (components/studio/top-nav.tsx) in its own identity.
 * ================================================================== */

import { Languages, Moon, Plus, Search, Settings, Sun } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { KnowledgeTheme } from "@/lib/knowledge/theme"
import { AccountControl } from "./account-control"
import { LOCALE_NAMES, useLocale, useT } from "./i18n"
import { cn } from "@/lib/utils"
import {
  KNOWLEDGE_ASK,
  KNOWLEDGE_NAV,
  KNOWLEDGE_SECONDARY_NAV,
  isNavActive,
  openCommandPalette,
  openSaveDialog,
} from "@/lib/knowledge/config"

export function KnowledgeSidebar({
  theme,
  onToggleTheme,
}: {
  theme: KnowledgeTheme
  onToggleTheme: () => void
}) {
  const pathname = usePathname()
  const t = useT()
  const { locale, setLocale } = useLocale()
  const other = locale === "pt-BR" ? "en" : "pt-BR"

  return (
    <aside className="sticky top-0 hidden h-dvh w-[var(--pk-rail)] shrink-0 flex-col border-r border-[var(--pk-rule)] px-5 lg:flex">
      {/* brand — a wordmark, not a logo in a coloured tile. The tile was
          the product's largest, loudest use of the accent, spent on
          something that carries no information. */}
      <Link
        href="/knowledge/home"
        className="mt-7 block text-[17px] font-semibold tracking-[-0.02em] text-[var(--pk-ink)]"
        aria-label={t.common.keeplyHome}
      >
        Keeply
      </Link>

      {/* ── Tier 1 — the two doors ─────────────────────────────── */}
      <div className="mt-7 space-y-1.5">
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex h-10 w-full items-center gap-2.5 rounded-full border border-[var(--pk-rule-2)] bg-[var(--pk-raised)] pl-3.5 pr-2 text-left transition-colors hover:border-[var(--pk-ink-4)]"
        >
          <Search className="size-[15px] shrink-0 text-[var(--pk-ink-3)]" strokeWidth={1.9} />
          <span className="flex-1 truncate text-[13.5px] text-[var(--pk-ink-3)]">{t.common.search}</span>
          <kbd className="pk-label rounded px-1 py-1 text-[9.5px] tracking-[0.08em]">⌘K</kbd>
        </button>

        <AskLink active={isNavActive(pathname, KNOWLEDGE_ASK.href)} />
      </div>

      {/* ── Tier 2 — browse ────────────────────────────────────── */}
      {/* The three tiers at the top of this file describe tier 3 as
       *  "saved filters, settings, account — quiet, at the bottom".
       *  The layout did not do that: `flex-1` sat on the whole nav, so
       *  both groups stayed packed under Browse and the slack —
       *  measured at 235px on a 900px viewport — opened up below them,
       *  between the rail's content and its capture button. The spacer
       *  now sits BETWEEN the groups, which puts tier 3 where the
       *  comment always said it went and leaves no void anywhere. */}
      <nav className="mt-8 flex flex-1 flex-col" aria-label={t.nav.knowledgeNavigation}>
        <p className="pk-label px-1 pb-2.5">{t.nav.browse}</p>
        <div className="space-y-px">
          {KNOWLEDGE_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
        </div>

        <div className="mt-6 flex-1" aria-hidden />

        <div className="space-y-px border-t border-[var(--pk-rule)] pt-5">
          {KNOWLEDGE_SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
          <NavLink
            item={{ href: "/knowledge/settings", labelKey: "settings", icon: Settings }}
            active={isNavActive(pathname, "/knowledge/settings")}
          />
        </div>
      </nav>

      {/* ── Capture ────────────────────────────────────────────────
          The product's one verb, and the one place the accent is spent
          in the chrome. Everything else on a Keeply screen earns its
          hierarchy from ink weight and space. */}
      <button
        onClick={openSaveDialog}
        className="mt-5 mb-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--pk-accent)] text-[13.5px] font-medium text-[var(--pk-accent-ink)] transition-opacity hover:opacity-90"
      >
        <Plus className="size-4" strokeWidth={2.4} />
        {t.common.saveALink}
      </button>

      {/* ── Appearance ─────────────────────────────────────────────
          The toggle used to live in the desktop top bar, which no
          longer exists. It belongs here anyway: this is the part of
          the rail that is about the reader rather than the library. */}
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={theme === "black" ? t.common.switchToLight : t.common.switchToDark}
        className="-mx-2 mb-1 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-[var(--pk-r)] px-2 py-1.5 text-left text-[13px] text-[var(--pk-ink-3)] transition-colors hover:bg-[var(--pk-sunken)] hover:text-[var(--pk-ink)]"
      >
        {theme === "black" ? <Sun className="size-[15px]" strokeWidth={1.8} /> : <Moon className="size-[15px]" strokeWidth={1.8} />}
        {theme === "black" ? t.common.light : t.common.dark}
      </button>

      {/* ── Language ───────────────────────────────────────────────
          Beside the theme toggle, in the part of the rail that is about
          the reader rather than the library — and, like it, it names
          the state it moves TO. A control labelled "Português" while
          the screen is already in Portuguese tells you nothing; one
          labelled "English" tells you what pressing it does. The name
          is always written IN its own language, because a language
          named in a language you cannot read is not a choice. */}
      <button
        type="button"
        onClick={() => setLocale(other)}
        lang={other}
        aria-label={`${t.common.language}: ${LOCALE_NAMES[other]}`}
        className="-mx-2 mb-1 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-[var(--pk-r)] px-2 py-1.5 text-left text-[13px] text-[var(--pk-ink-3)] transition-colors hover:bg-[var(--pk-sunken)] hover:text-[var(--pk-ink)]"
      >
        <Languages className="size-[15px]" strokeWidth={1.8} />
        {LOCALE_NAMES[other]}
      </button>

      {/* ── Account ───────────────────────────────────────────── */}
      <AccountControl layout="rail" />

    </aside>
  )
}

/** Ask gets a weight no browse item gets: full ink, a heavier face, and
 *  its own row. It is a destination that answers, not a place to look. */
function AskLink({ active }: { active: boolean }) {
  const t = useT()
  const Icon = KNOWLEDGE_ASK.icon
  return (
    <Link
      href={KNOWLEDGE_ASK.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-2.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors",
        active
          ? "border-transparent bg-[var(--pk-ink)] text-[var(--pk-ground)]"
          : "border-[var(--pk-rule-2)] text-[var(--pk-ink)] hover:bg-[var(--pk-sunken)]",
      )}
    >
      <Icon className="size-[15px]" strokeWidth={1.9} />
      {t.nav.askYourKnowledge}
    </Link>
  )
}

/** A browse row. Active state is ink weight plus a rule on the leading
 *  edge — not a filled accent pill, which is both louder than the
 *  content it sits beside and the single most dashboard-looking
 *  convention in the pattern library. */
function NavLink({ item, active }: { item: (typeof KNOWLEDGE_NAV)[number]; active: boolean }) {
  const t = useT()
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-[var(--pk-r-sm)] py-[7px] pl-3 pr-2 text-[13.5px] transition-colors",
        active
          ? "font-medium text-[var(--pk-ink)]"
          : "text-[var(--pk-ink-3)] hover:bg-[var(--pk-sunken)] hover:text-[var(--pk-ink)]",
      )}
    >
      {/* The rule marks the ITEM, so it sits just inside the rail's own
       *  padding — 8px clear of the row. At left-[-20px] it landed on
       *  the rail's outer edge, which at x=0 is the window edge: a 1px
       *  mark twenty pixels from the thing it marks reads as an
       *  artifact, not as a state. */}
      {active && (
        <span aria-hidden className="absolute left-[-8px] top-1/2 h-4 w-px -translate-y-1/2 bg-[var(--pk-ink)]" />
      )}
      <Icon className="size-[15px] shrink-0" strokeWidth={active ? 2 : 1.75} />
      {t.nav[item.labelKey]}
    </Link>
  )
}
