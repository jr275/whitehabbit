"use client"

/* ONBOARDING — the shared account's real first-run flow. Two steps:
 * a welcome that frames the two products on one account, then an
 * interest picker whose selections are persisted to the real
 * user_interests table via POST /api/onboarding. Completing stamps
 * onboarding_completed_at so /launch never routes here again. */

import { ArrowRight, Boxes, Check, LibraryBig, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

const TOPIC_GROUPS: { label: string; topics: string[] }[] = [
  { label: "Build", topics: ["AI agents", "Automation", "Engineering", "Product", "Data", "Design systems"] },
  { label: "Operate", topics: ["Operations", "Customer support", "Sales", "Marketing", "Finance", "Recruiting"] },
  { label: "Learn", topics: ["Research", "Strategy", "Leadership", "Economics", "Science", "Startups"] },
]

export function OnboardingFlow({
  email,
  organizationName,
  initialInterests,
}: {
  email: string
  organizationName: string
  initialInterests: string[]
}) {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1>(0)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialInterests))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(topic: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(topic) ? next.delete(topic) : next.add(topic)
      return next
    })
  }

  async function finish() {
    setSaving(true)
    setError(null)
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interests: Array.from(selected) }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setSaving(false)
      setError(body?.error ?? "Could not save your setup. Try again.")
      return
    }
    router.push("/")
    router.refresh()
  }

  return (
    <div className="studio-surface relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-5 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(110% 70% at 50% -10%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 60%)",
        }}
      />
      <div className="bg-substrate pointer-events-none absolute inset-0 opacity-50" aria-hidden />

      <div className="relative w-full max-w-xl">
        {/* progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <Dot active={step >= 0} />
          <span className="h-px w-8 bg-border" />
          <Dot active={step >= 1} />
        </div>

        {step === 0 ? (
          <section className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">Welcome{organizationName ? ` · ${organizationName}` : ""}</p>
            <h1 className="mt-4 text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground">
              Two products. One account.
            </h1>
            <p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              You&apos;re signed in as <span className="text-foreground">{email}</span>. Everything below lives on your
              organization — nothing is shared outside it.
            </p>

            <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
              <ProductCard
                icon={<Boxes className="size-4" />}
                name="Workforce"
                copy="Design, build, and operate an autonomous AI workforce against real objectives."
                tint="primary"
              />
              <ProductCard
                icon={<LibraryBig className="size-4" />}
                name="Knowledge"
                copy="Save articles, PDFs, and notes into a library that extracts and organizes them for you."
                tint="warn"
              />
            </div>

            <button
              onClick={() => setStep(1)}
              className="mt-8 inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-6 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Continue <ArrowRight className="size-3.5" />
            </button>
          </section>
        ) : (
          <section>
            <div className="text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">Personalize</p>
              <h1 className="mt-4 text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground">
                What are you into?
              </h1>
              <p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
                Pick a few topics to shape your workspace. You can change these anytime — and skip if you&apos;d rather not.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-5">
              {TOPIC_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.topics.map((topic) => {
                      const on = selected.has(topic)
                      return (
                        <button
                          key={topic}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(topic)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
                            on
                              ? "border-primary bg-primary/12 text-foreground"
                              : "border-border bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          {on && <Check className="size-3 text-primary" />}
                          {topic}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p role="alert" className="mt-5 text-center text-[12px] text-destructive">
                {error}
              </p>
            )}

            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={finish}
                  disabled={saving}
                  className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={finish}
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-6 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  {saving ? "Saving…" : selected.size > 0 ? `Finish with ${selected.size} selected` : "Finish setup"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Dot({ active }: { active: boolean }) {
  return <span className={`size-2 rounded-full transition-colors ${active ? "bg-primary" : "bg-border"}`} />
}

function ProductCard({
  icon,
  name,
  copy,
  tint,
}: {
  icon: React.ReactNode
  name: string
  copy: string
  tint: "primary" | "warn"
}) {
  const tintClass = tint === "primary" ? "bg-primary/12 text-primary" : "bg-warn/12 text-warn"
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <span className={`flex size-8 items-center justify-center rounded-lg ${tintClass}`}>{icon}</span>
      <p className="mt-3 text-sm font-medium text-foreground">{name}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  )
}
