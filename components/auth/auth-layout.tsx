import { Boxes, LibraryBig } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

/* Shared premium entry surface for every Whitehabbit auth screen
 * (login, signup, forgot/reset password). Split panel: an editorial
 * brand panel on the left (lg+) that communicates the ONE shared
 * account behind both products, and the form on the right. Purely
 * presentational — no client state — so it renders on the server. */

export function AuthLayout({
  children,
  eyebrow,
  title,
  subtitle,
}: {
  children: ReactNode
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <div className="studio-surface grid min-h-dvh grid-cols-1 bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* editorial brand panel */}
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
        <Link href="/" className="relative flex items-center gap-2.5" aria-label="Whitehabbit home">
          <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Boxes className="size-4" />
          </span>
          <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-foreground">
            Whitehabbit
          </span>
        </Link>

        <div className="relative max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary/80">One account</p>
          <h2 className="mt-4 text-balance font-serif text-[2.6rem] font-medium leading-[1.05] tracking-tight text-foreground">
            Your whole intelligent workforce — and everything worth remembering.
          </h2>
          <p className="mt-5 text-pretty text-sm leading-relaxed text-muted-foreground">
            Whitehabbit is two products on one secure account and organization. Sign in once to move freely between them.
          </p>
        </div>

        <div className="relative flex flex-col gap-3">
          <ProductRow
            icon={<Boxes className="size-4" />}
            name="Workforce"
            copy="Design, test and operate your AI workforce."
            tint="primary"
          />
          <ProductRow
            icon={<LibraryBig className="size-4" />}
            name="Knowledge"
            copy="Save anything worth remembering — organized for you."
            tint="warn"
          />
        </div>
      </aside>

      {/* form panel */}
      <main className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          {/* mobile wordmark */}
          <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 lg:hidden" aria-label="Whitehabbit home">
            <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Boxes className="size-4" />
            </span>
            <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-foreground">
              Whitehabbit
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

function ProductRow({
  icon,
  name,
  copy,
  tint,
}: {
  icon: ReactNode
  name: string
  copy: string
  tint: "primary" | "warn"
}) {
  const tintClass = tint === "primary" ? "bg-primary/12 text-primary" : "bg-warn/12 text-warn"
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-3.5">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${tintClass}`}>{icon}</span>
      <span>
        <span className="block text-sm font-medium text-foreground">{name}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">{copy}</span>
      </span>
    </div>
  )
}
