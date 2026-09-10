"use client"

import {
  AlertTriangle,
  Compass,
  GitCompareArrows,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Network,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import type { DrawerObject } from "@/lib/knowledge/intelligence/types"
import { cn } from "@/lib/utils"
import { PageContainer } from "../page-header"
import { ObjectDrawer } from "./object-drawer"
import { AskPanel } from "./panels/ask-panel"
import { ConceptsPanel } from "./panels/concepts-panel"
import { ConnectionsPanel } from "./panels/connections-panel"
import { ContradictionsPanel } from "./panels/contradictions-panel"
import { GapsPanel } from "./panels/gaps-panel"
import { InsightsPanel } from "./panels/insights-panel"
import { OverviewPanel } from "./panels/overview-panel"
import { QuestionsPanel } from "./panels/questions-panel"
import { ThemesPanel } from "./panels/themes-panel"
import { TimelinePanel } from "./panels/timeline-panel"
import { WhatChangedPanel } from "./panels/what-changed-panel"

export type SurfaceId =
  | "overview"
  | "concepts"
  | "themes"
  | "connections"
  | "timeline"
  | "insights"
  | "questions"
  | "gaps"
  | "contradictions"
  | "changes"
  | "ask"

const SURFACES: { id: SurfaceId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "concepts", label: "Concepts", icon: Tag },
  { id: "themes", label: "Themes", icon: Layers },
  { id: "connections", label: "Connections", icon: Network },
  { id: "timeline", label: "Timeline", icon: History },
  { id: "insights", label: "Insights", icon: Lightbulb },
  { id: "questions", label: "Questions", icon: HelpCircle },
  { id: "gaps", label: "Gaps", icon: Compass },
  { id: "contradictions", label: "Contradictions", icon: GitCompareArrows },
  { id: "changes", label: "What changed", icon: AlertTriangle },
  { id: "ask", label: "Ask & research", icon: Sparkles },
]

export function IntelligenceView({ initial = "overview" }: { initial?: SurfaceId }) {
  const [surface, setSurface] = useState<SurfaceId>(initial)
  const [drawer, setDrawer] = useState<DrawerObject | null>(null)
  const open = (o: DrawerObject) => setDrawer(o)

  return (
    <PageContainer>
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-primary">Explore</p>
        <h1 className="text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Your knowledge, understood.
        </h1>
        <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
          Concepts, themes and connections drawn from everything you save — with the open questions and gaps they reveal.
        </p>
      </header>

      {/* surface switcher */}
      <nav
        className="kn-scroll-x mt-8 flex gap-1.5 overflow-x-auto border-b border-[var(--kn-edge)] pb-3"
        aria-label="Knowledge surfaces"
      >
        {SURFACES.map((s) => {
          const Icon = s.icon
          const active = surface === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSurface(s.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={active ? 2.25 : 2} />
              {s.label}
            </button>
          )
        })}
      </nav>

      <div key={surface} className="kn-rise mt-8">
        {surface === "overview" && <OverviewPanel />}
        {surface === "concepts" && <ConceptsPanel onOpen={open} />}
        {surface === "themes" && <ThemesPanel onOpen={open} />}
        {surface === "connections" && <ConnectionsPanel onOpen={open} />}
        {surface === "timeline" && <TimelinePanel onOpen={open} />}
        {surface === "insights" && <InsightsPanel onOpen={open} />}
        {surface === "questions" && <QuestionsPanel />}
        {surface === "gaps" && <GapsPanel onOpen={open} />}
        {surface === "contradictions" && <ContradictionsPanel onOpen={open} />}
        {surface === "changes" && <WhatChangedPanel />}
        {surface === "ask" && <AskPanel />}
      </div>

      <ObjectDrawer object={drawer} onClose={() => setDrawer(null)} />
    </PageContainer>
  )
}
