"use client"

import { Building2, Users, Megaphone, Target, Database, ShieldAlert, Wrench, Gauge, CheckCircle2, Layers } from "lucide-react"
import { draftStore } from "@/lib/library/draft-store"
import { AUTONOMY_COPY, type Autonomy, type WorkerSpec } from "@/lib/library/spec-model"

/* ------------------------------------------------------------------ *
 * Last-mile configuration — "MAKE {NAME} YOURS".
 *
 * The prefab already carries 80-90% of the build. We only surface the
 * handful of decisions that genuinely need a human: business framing,
 * KPIs, autonomy, approvals and tool wiring. Everything writes to the
 * draft store and is reflected live in the spec summary.
 * ------------------------------------------------------------------ */

const SUGGESTED_APPROVALS = ["Budget changes", "Publishing content", "Payments", "Outbound sends", "Supplier changes"]

function Field({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[13px] font-medium text-foreground">{label}</h3>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{hint}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export function LastMile({ spec }: { spec: WorkerSpec }) {
  const approvalLabels = new Set(spec.approvalPolicy.map((a) => a.label))

  const toggleApproval = (label: string) => {
    const has = approvalLabels.has(label)
    const next = has
      ? spec.approvalPolicy.filter((a) => a.label !== label)
      : [...spec.approvalPolicy, { id: label.toLowerCase().replace(/\s+/g, "-"), label }]
    draftStore.setField("approvalPolicy", next)
  }

  const setPrimaryKpi = (id: string) => {
    const next = spec.kpis.map((k) => ({ ...k, weight: (k.id === id ? "primary" : "secondary") as "primary" | "secondary" }))
    draftStore.setField("kpis", next)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field icon={Building2} label="Company context" hint="What industry or business does this worker operate in?">
        <input
          className="modal-input"
          placeholder="e.g. B2B SaaS, Travel, E-commerce"
          value={spec.industry ?? ""}
          onChange={(e) => draftStore.setField("industry", e.target.value || null)}
        />
      </Field>

      <Field icon={Layers} label="Business model" hint="How the business makes money — shapes the worker's priorities.">
        <input
          className="modal-input"
          placeholder="e.g. Subscription, Marketplace, Transactional"
          value={spec.businessModel ?? ""}
          onChange={(e) => draftStore.setField("businessModel", e.target.value || null)}
        />
      </Field>

      <Field icon={Users} label="Target customers" hint="Who you're serving — used for segmentation and targeting.">
        <input
          className="modal-input"
          placeholder="e.g. Mid-market RevOps leaders"
          value={spec.targetAudience ?? ""}
          onChange={(e) => draftStore.setField("targetAudience", e.target.value || null)}
        />
      </Field>

      <Field icon={Megaphone} label="Brand voice" hint="The tone the worker uses when it communicates externally.">
        <input
          className="modal-input"
          placeholder="e.g. Confident, warm, jargon-free"
          value={spec.brandVoice ?? ""}
          onChange={(e) => draftStore.setField("brandVoice", e.target.value || null)}
        />
      </Field>

      <Field icon={Target} label="Primary KPI" hint="The one metric this worker optimizes above all others.">
        <div className="flex flex-col gap-1.5">
          {spec.kpis.map((k) => (
            <button
              key={k.id}
              onClick={() => setPrimaryKpi(k.id)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${
                k.weight === "primary"
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {k.label}
              {k.weight === "primary" && (
                <span className="font-mono text-[9px] uppercase tracking-wider text-primary">Primary</span>
              )}
            </button>
          ))}
        </div>
      </Field>

      <Field icon={Gauge} label="Autonomy level" hint="How much the worker can do on its own before asking.">
        <div className="flex flex-col gap-1.5">
          {(["low", "medium", "high"] as Autonomy[]).map((a) => (
            <button
              key={a}
              onClick={() => draftStore.setAutonomy(a)}
              className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                spec.autonomy === a
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-card hover:border-foreground/20"
              }`}
            >
              <span className="text-[12px] font-medium text-foreground">{AUTONOMY_COPY[a].label}</span>
              <span className="text-[11px] text-muted-foreground">{AUTONOMY_COPY[a].blurb}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field icon={ShieldAlert} label="Approval policies" hint="Actions the worker must never take without a human sign-off.">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_APPROVALS.map((label) => {
            const on = approvalLabels.has(label)
            return (
              <button
                key={label}
                onClick={() => toggleApproval(label)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  on
                    ? "border-warn/50 bg-warn/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
                style={on ? { color: "var(--foreground)" } : undefined}
              >
                {on ? "✓ " : "+ "}
                {label}
              </button>
            )
          })}
        </div>
      </Field>

      <Field icon={Wrench} label="Tools & integrations" hint="Which systems the worker can act through — and which need approval.">
        <div className="flex flex-col gap-1.5">
          {spec.tools.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <div>
                <p className="text-[12px] text-foreground">{t.label}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t.connected ? "Connected" : "Not connected"}
                </p>
              </div>
              <button
                onClick={() => draftStore.toggleToolApproval(t.id)}
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                  t.requiresApproval ? "bg-warn/15 text-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {t.requiresApproval ? "Approval" : "Auto"}
              </button>
            </div>
          ))}
        </div>
      </Field>

      <Field icon={Database} label="Data sources" hint="Knowledge the worker reasons over — pre-wired for this build.">
        <div className="flex flex-wrap gap-1.5">
          {spec.knowledgeSources.map((s) => (
            <span key={s} className="rounded-md border border-border bg-secondary/60 px-2 py-1 text-[11px] text-foreground/80">
              {s}
            </span>
          ))}
        </div>
      </Field>

      <Field icon={CheckCircle2} label="Success definition" hint="Inferred from your KPIs — what 'working' means for this worker.">
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[12px] leading-relaxed text-foreground">
          Success ={" "}
          <span style={{ color: "var(--grow)" }}>
            {spec.kpis.find((k) => k.weight === "primary")?.label ?? spec.kpis[0]?.label}
          </span>{" "}
          moves in the right direction while every gated action stays under human control.
        </p>
      </Field>
    </div>
  )
}
