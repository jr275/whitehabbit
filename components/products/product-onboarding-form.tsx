"use client"

/* ------------------------------------------------------------------ *
 * Product onboarding — the real capture point for a customer's
 * Domain Profile. Every answer here becomes real, persisted
 * KnowledgeSource content and, for the "rules" bucket, real
 * BehaviorRule heuristics (see app/api/products/[productId]/onboard/
 * route.ts) — not a cosmetic form that produces a demo.
 * ------------------------------------------------------------------ */

import { ArrowRight, Compass, Layers, Loader2, PenLine } from "lucide-react"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { StudioShell } from "@/components/studio/studio-shell"
import { PROFILE_BUCKET_LABEL, type ProductProfileBucket, type ProductTemplate } from "@/lib/products/catalog"

const ICONS = { PenLine, Layers, Compass }
const BUCKET_ORDER: ProductProfileBucket[] = ["business", "audience", "data", "process", "rules"]

export function ProductOnboardingForm({ product, runtimeMode }: { product: ProductTemplate; runtimeMode?: "development" | "preview" | "production" }) {
  const router = useRouter()
  const { status } = useSession()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = ICONS[product.icon]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    for (const field of product.onboarding) {
      if (field.required && !answers[field.key]?.trim()) {
        setError(`"${field.label}" is required.`)
        return
      }
    }
    setSubmitting(true)
    try {
      if (status !== "authenticated") {
        const email = `guest+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@whitehabbit.local`
        const password = crypto.randomUUID()
        const registerRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, organizationName: "My organization" }),
        })
        if (!registerRes.ok) {
          const body = await registerRes.json().catch(() => null)
          throw new Error(body?.error ?? "Could not create your workspace.")
        }
        const signInResult = await signIn("credentials", { email, password, redirect: false })
        if (signInResult?.error) throw new Error("Could not sign in to your new workspace.")
      }

      const res = await fetch(`/api/products/${encodeURIComponent(product.id)}/onboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Could not provision this worker.")
      router.push(`/studio?worker=${encodeURIComponent(body.worker.id)}`)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <StudioShell runtimeMode={runtimeMode}>
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: product.accent }}>
            <Icon className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Onboard</p>
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground">{product.name}</h1>
          </div>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          These answers become this worker&apos;s real Domain Profile — grounding text a real LLM call reads on every run, and, where you set rules, real
          behavior heuristics it must follow. Nothing here is cosmetic.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-7">
          {BUCKET_ORDER.map((bucket) => {
            const fields = product.onboarding.filter((f) => f.bucket === bucket)
            if (fields.length === 0) return null
            return (
              <div key={bucket}>
                <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{PROFILE_BUCKET_LABEL[bucket]}</p>
                <div className="space-y-4">
                  {fields.map((field) => (
                    <div key={field.key}>
                      <label htmlFor={`field-${field.key}`} className="mb-1.5 block text-[12.5px] font-medium text-foreground">
                        {field.label}
                        {field.required && <span className="ml-1 text-destructive">*</span>}
                      </label>
                      <textarea
                        id={`field-${field.key}`}
                        value={answers[field.key] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        rows={field.type === "textarea" ? 3 : 1}
                        maxLength={2000}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: product.accent }}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            {submitting ? "Provisioning worker" : "Create worker"}
          </button>
        </form>
      </div>
    </StudioShell>
  )
}
