/* ------------------------------------------------------------------ *
 * /studio — the build surface. Light, precise, information-dense. This
 * is where a worker is shaped: its objective, capabilities, autonomy,
 * guardrails, knowledge, and tools. The live Fabric is the running
 * consequence of what is configured here.
 * ------------------------------------------------------------------ */

import { ArrowUpRight, Check, Lock, MinusCircle, Plus } from "lucide-react"
import Link from "next/link"
import { AutonomyDial } from "@/components/studio/autonomy-dial"
import { CapabilityEditor } from "@/components/studio/capability-editor"
import { Metric, Section, StatusDot, Tag } from "@/components/studio/primitives"
import { StudioShell } from "@/components/studio/studio-shell"
import {
  DEPLOYMENT,
  GUARDRAILS,
  IDENTITY,
  INTEGRATIONS,
  KNOWLEDGE_GROUPS,
  MEMORY_SIGNALS,
  PERMISSIONS,
  POLICIES,
} from "@/lib/studio-data"

const CONN_META = {
  connected: { tone: "good" as const, label: "Connected" },
  action_required: { tone: "warn" as const, label: "Action required" },
  available: { tone: "muted" as const, label: "Available" },
}

export default function StudioPage() {
  return (
    <StudioShell>
      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        {/* page header */}
        <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
                Studio
              </h1>
              <Tag tone="primary">Build</Tag>
            </div>
            <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
              Shape {IDENTITY.name} — {IDENTITY.role.toLowerCase()}. Everything
              here is a knob; the live worker is the running consequence.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
            >
              View live worker
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90">
              <Check className="h-3.5 w-3.5" />
              Deploy changes
            </button>
          </div>
        </div>

        {/* body grid */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          {/* main column */}
          <div className="flex flex-col gap-5">
            {/* objective */}
            <Section
              title="Objective"
              hint="The worker's long-term intent — distinct from any single task."
            >
              <p className="text-pretty text-[15px] leading-relaxed text-foreground">
                {IDENTITY.objective}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>Role · {IDENTITY.role}</Tag>
                <Tag>Version {IDENTITY.version}</Tag>
                <Tag>Level {IDENTITY.level}</Tag>
              </div>
            </Section>

            {/* capabilities */}
            <Section
              title="Capabilities"
              hint="Six first-class capabilities. Toggle, inspect, and tune each."
              action={
                <button className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              }
            >
              <CapabilityEditor />
            </Section>

            {/* autonomy */}
            <Section
              title="Autonomy"
              hint="How far the worker acts before it must pause for a human."
            >
              <AutonomyDial />
            </Section>

            {/* guardrails */}
            <Section
              title="Guardrails"
              hint="Hard limits the worker operates within."
            >
              <ul className="flex flex-col divide-y divide-border">
                {GUARDRAILS.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="text-[13px] text-foreground">
                      {g.label}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                      {g.value}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* integrations */}
            <Section
              title="Tools & Integrations"
              hint="External systems the worker's capabilities can invoke."
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {INTEGRATIONS.map((it) => {
                  const m = CONN_META[it.state]
                  return (
                    <div
                      key={it.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">
                            {it.name}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {it.category}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[12px] text-muted-foreground">
                          {it.detail}
                        </p>
                        <div className="mt-2">
                          <StatusDot tone={m.tone} label={m.label} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          </div>

          {/* right rail */}
          <div className="flex flex-col gap-5">
            {/* deployment */}
            <Section title="Deployment">
              <div className="flex items-center justify-between">
                <StatusDot tone="good" label={DEPLOYMENT.status} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {DEPLOYMENT.environment}
                </span>
              </div>
              <dl className="mt-4 flex flex-col gap-2.5 text-[12px]">
                <Row k="Trigger" v={DEPLOYMENT.trigger} />
                <Row k="Region" v={DEPLOYMENT.region} />
                <Row k="Live since" v={DEPLOYMENT.since} />
              </dl>
            </Section>

            {/* knowledge & memory */}
            <Section
              title="Knowledge & Memory"
              hint="What it knows vs what it has learned."
            >
              <div className="grid grid-cols-3 gap-3">
                {KNOWLEDGE_GROUPS.slice(0, 6).map((g) => (
                  <Metric
                    key={g.label}
                    value={g.count.toLocaleString()}
                    label={g.label}
                  />
                ))}
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Learned signals
                </div>
                <ul className="flex flex-col gap-2.5">
                  {MEMORY_SIGNALS.map((s) => (
                    <li key={s.id} className="flex items-start gap-2.5">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-grow" />
                      <div>
                        <p className="text-[12px] leading-snug text-foreground">
                          {s.text}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {s.confidence}% · {s.source}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            {/* policies */}
            <Section title="Policies" hint="What the worker should do.">
              <ul className="flex flex-col gap-2.5">
                {POLICIES.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-grow" />
                    <span className="text-[12px] leading-snug text-foreground">
                      {p}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* permissions */}
            <Section
              title="Permissions"
              hint="What it can do vs what it must ask."
            >
              <ul className="flex flex-col divide-y divide-border">
                {PERMISSIONS.map((p) => (
                  <li
                    key={p.action}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="text-[13px] text-foreground">
                      {p.action}
                    </span>
                    {p.level === "allowed" ? (
                      <StatusDot tone="good" label="Allowed" />
                    ) : p.level === "approval" ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-warn">
                        <Lock className="h-3 w-3" />
                        Approval
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-destructive">
                        <MinusCircle className="h-3 w-3" />
                        Blocked
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      </div>
    </StudioShell>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {k}
      </dt>
      <dd className="text-right text-[12px] text-foreground">{v}</dd>
    </div>
  )
}
