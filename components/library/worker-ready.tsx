"use client"

/* ------------------------------------------------------------------ *
 * WORKER READY — the honest close of the creation flow.
 *
 * Separates what came PRE-BUILT (professional competency the user
 * never had to think about), what they CUSTOMIZED this session, and
 * what is still OPTIONAL (recommended but not required to ship).
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { Check, Sparkles, PencilLine, CircleDashed } from "lucide-react"
import type { WorkerSpec } from "@/lib/library/spec-model"
import { FIELD_LABELS } from "@/lib/library/spec-model"

interface Props {
  spec: WorkerSpec
  customized: string[]
  onDeploy: () => void
  onBack: () => void
}

export function WorkerReady({ spec, customized, onDeploy, onBack }: Props) {
  // pre-built: the professional competencies that shipped with the prefab
  const skillTotal = spec.skillClusters.reduce((n, c) => n + c.skills.length, 0)
  const preBuilt = [
    `${skillTotal} skills across ${spec.skillClusters.length} clusters`,
    `${spec.tools.length} connected tools`,
    `${spec.knowledgeSources.length} knowledge sources`,
    `${spec.outcomes.length}-stage outcome intelligence`,
  ]

  // customized: fields the user explicitly changed this session
  const customLabels = customized
    .map((path) => FIELD_LABELS[path] ?? path)
    .filter((v, i, a) => a.indexOf(v) === i)

  // optional: high-value fields still on their default / empty
  const optional: string[] = []
  if (!customized.includes("industry")) optional.push("Narrow the industry focus")
  if (!customized.includes("kpis")) optional.push("Confirm the primary KPI")
  if (!customized.includes("approvalPolicy")) optional.push("Review approval policy")
  if (!customized.includes("tools")) optional.push("Set per-tool permissions")

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-2xl"
    >
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-alive/15 text-alive ring-1 ring-alive/30">
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </div>
        <h2 className="mt-5 text-pretty text-2xl font-semibold tracking-tight text-foreground">
          {spec.codename} is ready to work
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          {spec.role}. It arrived with professional judgment built in — you only shaped what makes it yours.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <ReadyGroup
          icon={<Sparkles className="h-4 w-4" />}
          tone="alive"
          title="Came pre-built"
          caption="Professional competency you never had to configure"
          items={preBuilt}
        />
        <ReadyGroup
          icon={<PencilLine className="h-4 w-4" />}
          tone="grow"
          title="You customized"
          caption={customLabels.length ? "Tuned to your world this session" : "Nothing changed — the defaults fit"}
          items={customLabels.length ? customLabels : ["Shipped with recommended defaults"]}
        />
        {optional.length > 0 && (
          <ReadyGroup
            icon={<CircleDashed className="h-4 w-4" />}
            tone="muted"
            title="Optional, anytime"
            caption="Not required to deploy — refine whenever you like"
            items={optional}
          />
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Keep customizing
        </button>
        <button
          type="button"
          onClick={onDeploy}
          className="rounded-lg bg-alive px-6 py-2.5 text-sm font-semibold text-alive-foreground shadow-lg shadow-alive/20 transition-transform hover:scale-[1.02]"
        >
          Deploy {spec.codename}
        </button>
      </div>
    </motion.div>
  )
}

function ReadyGroup({
  icon,
  tone,
  title,
  caption,
  items,
}: {
  icon: React.ReactNode
  tone: "alive" | "grow" | "muted"
  title: string
  caption: string
  items: string[]
}) {
  const toneClass =
    tone === "alive"
      ? "text-alive ring-alive/25 bg-alive/10"
      : tone === "grow"
        ? "text-grow ring-grow/25 bg-grow/10"
        : "text-muted-foreground ring-border bg-secondary"

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${toneClass}`}>{icon}</span>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-2 text-xs text-foreground/80">
            <span className="h-1 w-1 rounded-full bg-current opacity-40" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}
