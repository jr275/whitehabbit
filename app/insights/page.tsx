/* ------------------------------------------------------------------ *
 * /insights — WhiteHabbit Insights.
 * Transforme conversas com clientes em melhores decisões de negócio.
 * A peça interativa (AskInsights) demonstra o conversacional; as seções
 * ilustram descoberta, automação, tempo real e acompanhamento de
 * resultados guiados por KPIs (CSAT, Resolução, AHT, Conversão).
 * ------------------------------------------------------------------ */

import { ArrowRight, Gauge, LineChart, MessagesSquare, Radar, Sparkles, Target, Wand2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { AskInsights } from "@/components/insights/ask-insights"
import { TopNav } from "@/components/studio/top-nav"
import { GUIDED_KPIS, OUTCOME_STATS } from "@/lib/insights/insights-data"

export const metadata = {
  title: "WhiteHabbit Insights — Conversas em decisões de negócio",
  description:
    "Descubra o que impulsiona os contatos e os resultados, acompanhe jornadas ao longo do tempo e aja sobre automação — guiado por CSAT, resolução, AHT e conversão.",
}

const CAPABILITIES = [
  {
    icon: Radar,
    kicker: "Descoberta",
    title: "Descubra o que importa — e o que fazer a respeito",
    body: "Vá de “o que aconteceu” para “por quê”. Faça emergir o desconhecido desconhecido e antecipe tendências antes que virem volume.",
    image: "/insights/why-calling.png",
    alt: "Cluster de motivos de conversa com resposta conversacional explicando por que clientes ligam",
  },
  {
    icon: Wand2,
    kicker: "Automação",
    title: "Encontre as melhores oportunidades de automação",
    body: "Identifique interações e fluxos mais adequados para automação com base em conversas reais e impacto nos resultados, para priorizar os casos certos de Agente de IA.",
    image: "/insights/automation-readiness.png",
    alt: "Mapa de prontidão para automação com taxa de resolução e nível de prontidão por fluxo",
  },
  {
    icon: LineChart,
    kicker: "Dashboards → Respostas",
    title: "Transforme dashboards em respostas",
    body: "Painéis por função para liderança, operações e CX — e qualquer pessoa explora em detalhe, perguntando o que está por trás de cada tendência e mudança.",
    image: "/insights/aht-compare.png",
    alt: "Gráfico de AHT por região com resposta comparando Oeste e Sudoeste",
  },
  {
    icon: Sparkles,
    kicker: "Tempo real",
    title: "Melhore o desempenho do agente no momento",
    body: "Orientação e suporte de fluxo em tempo real, vinculados a vendas, retenção e CSAT — para que as melhores práticas sejam consistentes, escaláveis e mensuráveis.",
    image: "/insights/pitch-revenue.png",
    alt: "Gráfico de receita de attach por conversa com sugestão de oferta em tempo real",
  },
]

export default function InsightsPage() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        {/* halo sutil */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/12 blur-[120px]" />
        </div>

        <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
                <MessagesSquare className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  WhiteHabbit Insights
                </span>
              </div>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
                Transforme conversas com clientes em melhores decisões de
                negócio
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
                O Insights ajuda líderes a descobrir o que impulsiona os
                contatos e os resultados, acompanhar as jornadas dos clientes
                ao longo do tempo e agir sobre automação, capacitação de
                agentes e decisões estratégicas — tudo guiado de ponta a ponta
                por KPIs.
              </p>

              {/* KPIs guiados */}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted-foreground">
                  Guiado por:
                </span>
                {GUIDED_KPIS.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[12px] font-medium text-foreground"
                  >
                    <Gauge className="h-3 w-3 text-primary" />
                    {k}
                  </span>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/library"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Solicite uma demonstração
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#experimente"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Experimente o conversacional
                </a>
              </div>
            </div>

            {/* prova visual: chat sobre fluxo */}
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40">
                <Image
                  src="/insights/flow-chat.png"
                  alt="Mapa de fluxo de conversa com chat ao vivo respondendo perguntas sobre uma cobrança desconhecida"
                  width={1200}
                  height={1230}
                  className="h-auto w-full"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EXPERIMENTE — peça interativa */}
      <section id="experimente" className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
              Transforme dashboards em respostas
            </h2>
            <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Pergunte em linguagem natural. O Insights amostra as conversas
              reais, explica o porquê e recomenda a próxima ação.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-2xl">
            <AskInsights />
          </div>
        </div>
      </section>

      {/* CAPACIDADES */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
              Use seus insights para obter vantagem competitiva
            </h2>
            <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Da descoberta à ação em tempo real — cada capacidade nasce de
              conversas reais e se conecta a um resultado mensurável.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <article
                key={c.title}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="p-6">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12">
                      <c.icon className="h-4 w-4 text-primary" />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {c.kicker}
                    </span>
                  </div>
                  <h3 className="mt-3 text-pretty text-[19px] font-semibold leading-snug text-foreground">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                    {c.body}
                  </p>
                </div>
                <div className="mt-auto border-t border-border bg-secondary/30 p-3">
                  <div className="overflow-hidden rounded-xl border border-border bg-background">
                    <Image
                      src={c.image || "/placeholder.svg"}
                      alt={c.alt}
                      width={1200}
                      height={900}
                      className="h-auto w-full"
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* RESULTADOS — acompanhamento */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Acompanhamento de resultados
            </span>
          </div>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground">
            Transforme insights em ação e economia em escala
          </h2>

          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {OUTCOME_STATS.map((s) => (
              <div key={s.label} className="bg-card p-6">
                <div className="text-3xl font-semibold tracking-tight text-foreground">
                  {s.value}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* citação de cliente */}
          <figure className="mt-8 rounded-2xl border border-border bg-card p-6 sm:p-8">
            <blockquote className="max-w-3xl text-pretty text-[18px] leading-relaxed text-foreground">
              “Quase que instantaneamente percebemos que algo estava mudando e
              conseguimos resolver o problema no mesmo dia. Antes do Insights,
              levaríamos semanas até identificar que havia um problema.”
            </blockquote>
            <figcaption className="mt-4 text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">
                Todd Traynor-Corey
              </span>{" "}
              · Vice-presidente de Produtos e Experiência do Cliente
            </figcaption>
          </figure>
        </div>
      </section>

      {/* CTA final */}
      <section>
        <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-10 text-center sm:p-14">
            <div className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary/12 blur-[100px]" />
            </div>
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Uma plataforma, valor exponencial
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Unifique agentes humanos e de IA com contexto, fluxos e governança
              compartilhados. Cada interação conectada à jornada do cliente —
              sem silos, com melhoria contínua ao longo do tempo.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/library"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Solicite uma demonstração
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-[14px] font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Abrir o Studio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
