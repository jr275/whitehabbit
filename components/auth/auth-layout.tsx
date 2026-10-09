import { Boxes, LibraryBig } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import type { ProductContext } from "@/lib/auth-context"

/* ================================================================== *
 * THE ENTRY SURFACE — shared by every auth screen (login, signup,
 * forgot / reset password).
 *
 * ONE ROUTE, ONE SESSION, THREE PRESENTATIONS.
 *
 * Nothing about authentication is duplicated here: the forms, the
 * Auth.js configuration, the session and the users table are single
 * and shared, and this file does not touch any of them. What it does
 * is stop the entry screen from being a third product.
 *
 * It used to render one way — the Workforce identity — and then hand a
 * Knowledge user straight into Keeply. Signing in looked like being
 * passed between two companies. Giving it the Keeply identity instead
 * would have made the same mistake pointing the other way: Workforce
 * would have inherited a visual language that is not its.
 *
 * So the destination decides, and only when the destination said
 * something:
 *
 *   knowledge  →  Keeply: light ground, quiet indigo, sans + mono
 *   workforce  →  Menlo Whitehabbit: near-black, the technical grid,
 *                 the fabric accent, the serif display
 *   neutral    →  the platform, with every product signal removed
 *
 * The forms inside `children` need no edit in any of the three,
 * because they are written against the semantic tokens (`--card`,
 * `--border`, `bg-primary`, `.modal-input`) and each scope re-points
 * those. That is the whole reason this is cheap AND complete.
 * ================================================================== */

export function AuthLayout({
  children,
  eyebrow,
  title,
  subtitle,
  context = "neutral",
}: {
  children: ReactNode
  eyebrow: string
  title: string
  subtitle: string
  /** Which product the person is heading into, resolved from the
   *  callbackUrl by lib/auth-context.ts. */
  context?: ProductContext
}) {
  if (context === "knowledge") return <KnowledgeEntry {...{ eyebrow, title, subtitle }}>{children}</KnowledgeEntry>
  if (context === "workforce") return <WorkforceEntry {...{ eyebrow, title, subtitle }}>{children}</WorkforceEntry>
  return <NeutralEntry {...{ eyebrow, title, subtitle }}>{children}</NeutralEntry>
}

interface EntryProps {
  children: ReactNode
  eyebrow: string
  title: string
  subtitle: string
}

/* ── Keeply ─────────────────────────────────────────────────────────
 * Light, typographic, one hairline between the statement and the form.
 * No fill, no gradient, no grid texture: the division is structural,
 * and a rule states structure at no cost. */
function KnowledgeEntry({ children, eyebrow, title, subtitle }: EntryProps) {
  return (
    <div className="knowledge-surface grid min-h-dvh grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden border-r border-[var(--pk-rule)] px-[var(--pk-gutter)] py-12 lg:flex lg:flex-col lg:justify-between">
        <Link
          href="/knowledge/home"
          className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--pk-ink)]"
          aria-label="Keeply home"
        >
          Keeply
        </Link>

        <div className="max-w-[32rem]">
          <p className="pk-label">Personal knowledge</p>
          <h2 className="pk-display mt-5 max-w-[15ch] text-[var(--pk-ink)]">Everything worth remembering.</h2>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.65] text-[var(--pk-ink-3)]">
            Save anything. Keeply reads it, finds what it is about, and connects it to everything else you keep.
          </p>
        </div>

        <p className="pk-meta max-w-[40ch]">
          One account also opens Menlo Whitehabbit, where you build and operate an AI workforce.
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-[22rem]">
          <Link
            href="/knowledge/home"
            className="mb-10 block text-center text-[16px] font-semibold tracking-[-0.02em] text-[var(--pk-ink)] lg:hidden"
            aria-label="Keeply home"
          >
            Keeply
          </Link>

          <div className="mb-8">
            <p className="pk-label">{eyebrow}</p>
            <h1 className="pk-title mt-3.5 text-balance text-[var(--pk-ink)]">{title}</h1>
            <p className="mt-3 text-pretty text-[14px] leading-[1.6] text-[var(--pk-ink-3)]">{subtitle}</p>
          </div>

          {children}
        </div>
      </main>
    </div>
  )
}

/* ── Menlo Whitehabbit ──────────────────────────────────────────────
 * Unchanged from what this file always rendered: the operational dark
 * ground, the technical grid, the fabric accent, the serif display.
 * Workforce keeps its identity exactly as it was — the point of this
 * change is that it stops being the ONLY identity, not that it moves. */
function WorkforceEntry({ children, eyebrow, title, subtitle }: EntryProps) {
  return (
    <div className="studio-surface grid min-h-dvh grid-cols-1 bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-substrate pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(120% 80% at 15% 0%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 60%)",
          }}
        />
        <Link href="/workforce" className="relative flex items-center gap-2.5" aria-label="Menlo Whitehabbit home">
          <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Boxes className="size-4" />
          </span>
          <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-foreground">
            Menlo Whitehabbit
          </span>
        </Link>

        <div className="relative max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary/80">AI workforce</p>
          <h2 className="mt-4 text-balance font-serif text-[2.6rem] font-medium leading-[1.05] tracking-tight text-foreground">
            Design, test and operate your intelligent workforce.
          </h2>
          <p className="mt-5 text-pretty text-sm leading-relaxed text-muted-foreground">
            Objective → blueprint → worker → run → observe → output, with every step recorded.
          </p>
        </div>

        <p className="relative font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          One account also opens Keeply, your knowledge library.
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link
            href="/workforce"
            className="mb-8 flex items-center justify-center gap-2.5 lg:hidden"
            aria-label="Menlo Whitehabbit home"
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Boxes className="size-4" />
            </span>
            <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-foreground">
              Menlo Whitehabbit
            </span>
          </Link>

          <div className="mb-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
            <h1 className="mt-2 text-balance font-serif text-3xl font-medium tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-pretty text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>

          {children}
        </div>
      </main>
    </div>
  )
}

/* ── Neutral ────────────────────────────────────────────────────────
 * Nobody said where they were going, so the screen says nothing about
 * it either. One centred column, the umbrella wordmark, no accent, and
 * the two products named as destinations rather than dressed as one.
 * `.auth-neutral` strips the coloured accent (see globals.css) so the
 * single action is achromatic — which is what keeps this from reading
 * as Workforce, whose ground it shares. */
function NeutralEntry({ children, eyebrow, title, subtitle }: EntryProps) {
  return (
    <div className="auth-neutral flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-14">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="block font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-foreground"
          aria-label="Whitehabbit home"
        >
          Whitehabbit
        </Link>

        <div className="mb-7 mt-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
          <p className="mt-2 text-pretty text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>

        {children}

        {/* Named, not branded: two destinations one account reaches,
            with neither one's visual language borrowed to say so. */}
        <dl className="mt-10 border-t border-border pt-6">
          <Destination
            icon={<Boxes className="size-3.5" />}
            name="Menlo Whitehabbit"
            copy="Design, test and operate an AI workforce."
          />
          <Destination
            icon={<LibraryBig className="size-3.5" />}
            name="Keeply"
            copy="Save anything worth remembering — organized for you."
          />
        </dl>
      </div>
    </div>
  )
}

function Destination({ icon, name, copy }: { icon: ReactNode; name: string; copy: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span>
        <dt className="text-[13px] font-medium text-foreground">{name}</dt>
        <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{copy}</dd>
      </span>
    </div>
  )
}
