"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — HOME / CREATE
 *
 * The user describes a job. "Assemble Worker" is a real backend
 * operation (POST /api/agents/blueprint): the real LLM provider
 * abstraction analyzes the objective against the real, currently-
 * executable skill catalog and returns a real, persisted Worker,
 * pre-populated with identity/mission/skills/tools/outcome — not a
 * cinematic simulation. The user then lands in the real Agent Studio
 * to configure, test, and run it.
 *
 * This intentionally keeps only the create step from the previous
 * homepage (same copy, same input) — the "live" Fabric/simulation
 * phase that used to follow it was never reachable in practice (the
 * old handler navigated away before any of it rendered) and was built
 * on simulated capability scores and a fake worker-state store
 * disconnected from the real one — see lib/simulation.ts,
 * lib/worker/worker-state.ts. Real execution, real events and real
 * metrics live in Studio (/studio) and Outputs (/outputs).
 * ------------------------------------------------------------------ */

import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Loader2 } from "lucide-react"
import { signIn, useSession } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function Page() {
  const router = useRouter()
  const { status } = useSession()
  const [value, setValue] = useState("")
  const [assembling, setAssembling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAssemble(objective: string) {
    setError(null)
    setAssembling(true)
    try {
      // An anonymous visitor still gets a real account, not a demo
      // session — sign in as a fresh guest-style account tied to a
      // real, isolated organization, then continue with the same
      // request. No fabricated worker is ever shown pre-auth.
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

      const res = await fetch("/api/agents/blueprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Could not assemble the worker.")

      router.push(`/studio?worker=${encodeURIComponent(body.worker.id)}`)
    } catch (err) {
      setAssembling(false)
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  return (
    <main className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-background bg-substrate px-6">
      <Link
        href="/products"
        className="absolute right-6 top-6 z-10 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Explore products →
      </Link>
      <AnimatePresence mode="wait">
        {!assembling ? (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-2xl text-center"
          >
            <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.35em] text-muted-foreground">WhiteHabbit</p>
            <h1 className="text-balance text-4xl font-medium tracking-tight sm:text-5xl">What should your worker do?</h1>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const v = value.trim()
                if (v) handleAssemble(v)
              }}
              className="mx-auto mt-10 w-full max-w-xl"
            >
              <div className="group flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4 backdrop-blur-sm transition-colors focus-within:border-primary/60">
                <input
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Find high-quality enterprise leads and book qualified meetings."
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
                  aria-label="Worker objective"
                />
              </div>
              {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={!value.trim()}
                className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-primary-foreground transition-opacity disabled:opacity-30"
              >
                Assemble worker
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="assembling"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full max-w-xl flex-col items-center text-center"
          >
            <p className="mb-8 max-w-md text-pretty text-sm text-muted-foreground">&ldquo;{value}&rdquo;</p>
            <div className="flex items-center gap-2.5 font-mono text-[13px] uppercase tracking-[0.3em] text-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Assembling worker
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
