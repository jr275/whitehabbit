"use client"

/* ------------------------------------------------------------------ *
 * "Pergunte qualquer coisa" — o coração interativo do Insights.
 * O usuário escolhe (ou digita) uma pergunta; a análise é encenada em
 * passos e então um insight estruturado é revelado com achados, KPI e
 * ação recomendada. Transforma dashboards em respostas.
 * ------------------------------------------------------------------ */

import { ArrowUp, Check, Loader2, Mic, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { SAMPLE_QUESTIONS, type InsightAnswer } from "@/lib/insights/insights-data"
import { Sparkline } from "./sparkline"

type Phase = "idle" | "analyzing" | "answered"

export function AskInsights() {
  const [input, setInput] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [current, setCurrent] = useState<InsightAnswer | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const resultRef = useRef<HTMLDivElement>(null)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => () => clearTimers(), [])

  const run = useCallback((answer: InsightAnswer) => {
    clearTimers()
    setCurrent(answer)
    setPhase("analyzing")
    setStepIndex(0)
    setElapsed(0)

    const stepMs = 620
    answer.steps.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => setStepIndex(i + 1), stepMs * (i + 1)),
      )
    })
    // relógio de decorrido
    const started = Date.now()
    const tick = setInterval(() => setElapsed(Date.now() - started), 100)
    timers.current.push(tick as unknown as ReturnType<typeof setTimeout>)

    timers.current.push(
      setTimeout(
        () => {
          clearInterval(tick)
          setPhase("answered")
          requestAnimationFrame(() =>
            resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
          )
        },
        stepMs * answer.steps.length + 500,
      ),
    )
  }, [])

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    // casa com uma pergunta curada por sobreposição de palavras, senão usa a 1ª
    const match =
      SAMPLE_QUESTIONS.find((q) =>
        q.question.toLowerCase().includes(text.toLowerCase().slice(0, 8)),
      ) ?? bestOverlap(text) ?? SAMPLE_QUESTIONS[0]
    setInput(match.question)
    run(match)
  }

  const seconds = (elapsed / 1000).toFixed(0)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* barra superior estilo produto */}
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-medium text-foreground">
          Pergunte aos seus dados
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Conversational Insights
        </span>
      </div>

      <div className="p-5">
        {/* chips de pergunta */}
        <p className="mb-2.5 text-[12px] text-muted-foreground">
          Experimente uma pergunta real de operação:
        </p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((q) => {
            const active = current?.id === q.id
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setInput(q.question)
                  run(q)
                }}
                className={`rounded-full border px-3 py-1.5 text-left text-[12px] leading-tight transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {q.question}
              </button>
            )
          })}
        </div>

        {/* entrada */}
        <form onSubmit={onSubmit} className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3.5 py-2.5 focus-within:border-ring">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte qualquer coisa sobre suas conversas…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              aria-label="Falar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mic className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="submit"
            disabled={!input.trim() || phase === "analyzing"}
            aria-label="Perguntar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>

        {/* estado vazio */}
        {phase === "idle" && (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-6 text-center">
            <p className="text-[13px] text-muted-foreground">
              Selecione ou digite uma pergunta para transformar o dashboard em
              uma resposta explicável.
            </p>
          </div>
        )}

        {/* analisando */}
        {phase === "analyzing" && current && (
          <div className="mt-5 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-[13px] font-medium text-foreground">
                Analisando conversas
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                ({seconds}s)
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {current.steps.map((s, i) => {
                const done = i < stepIndex
                const active = i === stepIndex
                return (
                  <li
                    key={s}
                    className={`flex items-center gap-2 text-[12px] transition-colors ${
                      done
                        ? "text-foreground"
                        : active
                          ? "text-foreground"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5 text-grow" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <span className="h-3.5 w-3.5" />
                    )}
                    {s}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* resposta */}
        {phase === "answered" && current && (
          <div
            ref={resultRef}
            className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div className="rounded-xl border border-border bg-background p-5">
              {/* topo: amostra + KPI */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkline points={current.spark} className="h-8 w-16" />
                  <span className="text-[11px] text-muted-foreground">
                    {current.sampled}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
                  {current.kpi.trend === "up" ? (
                    <TrendingUp className="h-3.5 w-3.5 text-grow" />
                  ) : current.kpi.trend === "down" ? (
                    <TrendingDown className="h-3.5 w-3.5 text-grow" />
                  ) : null}
                  <span className="font-mono text-[13px] font-medium tabular-nums text-foreground">
                    {current.kpi.value}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {current.kpi.label}
                  </span>
                </div>
              </div>

              <h3 className="mt-4 text-pretty text-[16px] font-semibold leading-snug text-foreground">
                {current.headline}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {current.summary}
              </p>

              {/* achados */}
              <ol className="mt-4 space-y-3">
                {current.findings.map((f, i) => (
                  <li key={f.label} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/12 font-mono text-[11px] font-medium text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium text-foreground">
                          {f.label}
                        </span>
                        {f.share > 0 && (
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {f.share}%
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                        {f.detail}
                      </p>
                      {f.share > 0 && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${f.share}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {/* ação recomendada */}
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/8 p-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                    Ação recomendada
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-foreground">
                    {current.action}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** melhor pergunta por sobreposição simples de tokens */
function bestOverlap(text: string): InsightAnswer | null {
  const tokens = text.toLowerCase().split(/\s+/).filter((t) => t.length > 3)
  let best: InsightAnswer | null = null
  let bestScore = 0
  for (const q of SAMPLE_QUESTIONS) {
    const hay = (q.question + " " + q.headline).toLowerCase()
    const score = tokens.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0)
    if (score > bestScore) {
      bestScore = score
      best = q
    }
  }
  return bestScore > 0 ? best : null
}
