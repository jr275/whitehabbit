"use client"

/* ------------------------------------------------------------------ *
 * Worker configuration flow — /library/[id]
 *
 * Three honest steps on top of the shared draft store:
 *   BRIEF     — voice/text transformation into proposed changes
 *   CUSTOMIZE — the make-it-yours last-mile surface
 *   READY     — pre-built vs customized vs optional, then deploy
 *
 * The prefab already ships with professional competency; every step
 * only *adds* the user's world on top of it.
 * ------------------------------------------------------------------ */

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { TopNav } from "@/components/studio/top-nav"
import { Transformation } from "@/components/library/transformation"
import { LastMile } from "@/components/library/last-mile"
import { WorkerReady } from "@/components/library/worker-ready"
import { draftStore, useDraft } from "@/lib/library/draft-store"
import { getPrefab } from "@/lib/library/prefabs"
import type { Extraction } from "@/lib/library/intent"

type Step = "brief" | "customize" | "ready"

const STEPS: { id: Step; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "customize", label: "Customize" },
  { id: "ready", label: "Ready" },
]

export default function ConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { draft, customized } = useDraft()
  const [step, setStep] = useState<Step>("brief")
  const prefab = getPrefab(id)

  // start (or resume) a draft from this prefab on mount
  useEffect(() => {
    draftStore.hydrate()
    const current = draftStore.getSnapshot().draft
    if (!current || current.id !== id) draftStore.startFrom(id)
  }, [id])

  if (!prefab) {
    return (
      <div className="min-h-dvh bg-background">
        <TopNav />
        <div className="mx-auto max-w-md px-5 py-32 text-center">
          <p className="text-sm text-muted-foreground">That worker doesn&apos;t exist in the library.</p>
          <Link href="/library" className="mt-4 inline-block text-sm font-medium text-alive">
            Back to the library
          </Link>
        </div>
      </div>
    )
  }

  // draft not ready on first paint
  const spec = draft && draft.id === id ? draft : prefab

  const applyExtraction = (e: Extraction) => {
    draftStore.applyExtraction(e)
    setStep("customize")
  }

  const deploy = () => {
    draftStore.ship()
    router.push("/studio")
  }

  return (
    <div className="min-h-dvh bg-background">
      <TopNav />

      <div className="mx-auto max-w-5xl px-5 py-8">
        {/* header */}
        <div className="flex items-center justify-between">
          <Link
            href="/library"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Library
          </Link>
          <Stepper step={step} onJump={setStep} />
        </div>

        {/* worker identity ribbon */}
        <div className="mt-6 flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-background"
            style={{ backgroundColor: spec.accent }}
          >
            {spec.codename.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{spec.codename}</h1>
            <p className="text-sm text-muted-foreground">{spec.role}</p>
          </div>
        </div>

        {/* step body */}
        <div className="mt-8">
          {step === "brief" && (
            <Transformation base={spec} onApply={applyExtraction} onSkip={() => setStep("customize")} />
          )}
          {step === "customize" && (
            <div>
              <LastMile spec={spec} />
              <div className="mt-8 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep("brief")}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Back to brief
                </button>
                <button
                  type="button"
                  onClick={() => setStep("ready")}
                  className="rounded-lg bg-alive px-6 py-2.5 text-sm font-semibold text-alive-foreground shadow-lg shadow-alive/20 transition-transform hover:scale-[1.02]"
                >
                  Review &amp; deploy
                </button>
              </div>
            </div>
          )}
          {step === "ready" && (
            <WorkerReady spec={spec} customized={customized} onDeploy={deploy} onBack={() => setStep("customize")} />
          )}
        </div>
      </div>
    </div>
  )
}

function Stepper({ step, onJump }: { step: Step; onJump: (s: Step) => void }) {
  const activeIndex = STEPS.findIndex((s) => s.id === step)
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i < activeIndex
        const active = i === activeIndex
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.id)}
            className="flex items-center gap-1.5"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                active
                  ? "bg-alive text-alive-foreground"
                  : done
                    ? "bg-alive/20 text-alive"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"} ${
                i < STEPS.length - 1 ? "mr-2" : ""
              }`}
            >
              {s.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
