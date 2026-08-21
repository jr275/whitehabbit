"use client"

import { useState } from "react"
import { ArrowUpRight, Lock, Sparkles } from "lucide-react"
import {
  CATEGORY_LABEL,
  type CharacterWorker,
  MASTERY_LABEL,
  type Mastery,
  type SkillCategory,
  type SkillNode,
  isSkillUnlocked,
  masteryForLevel,
  nextUnlock,
  unlockedCapabilities,
} from "@/lib/character/character-model"
import { characterStore, type UpgradeResult } from "@/lib/character/character-store"

const CAT_HUE: Record<SkillCategory, number> = {
  research: 226,
  reasoning: 250,
  communication: 202,
  execution: 266,
  reliability: 190,
}

const MASTERY_TONE: Record<Mastery, string> = {
  novice: "text-white/45",
  developing: "text-primary",
  advanced: "text-primary",
  expert: "text-warn",
}

/* ---- level segment bar ---- */
function LevelBar({ level, max, hue }: { level: number; max: number; hue: number }) {
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-[1px]"
          style={{
            background: i < level ? `hsl(${hue} 85% 66%)` : "rgba(255,255,255,0.1)",
            boxShadow: i < level && i === level - 1 ? `0 0 6px hsl(${hue} 90% 65% / 0.8)` : "none",
          }}
        />
      ))}
    </div>
  )
}

/* ---- one skill node ---- */
function SkillChip({
  skill,
  all,
  selected,
  onSelect,
  onHover,
}: {
  skill: SkillNode
  all: SkillNode[]
  selected: boolean
  onSelect: () => void
  onHover: (c: SkillCategory | null) => void
}) {
  const hue = CAT_HUE[skill.category]
  const unlocked = isSkillUnlocked(skill, all)
  const mastery = masteryForLevel(skill.level, skill.maxLevel)
  const isRoot = skill.tier === 0

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => onHover(skill.category)}
      onMouseLeave={() => onHover(null)}
      disabled={!unlocked}
      className={`group relative w-full rounded-xl border p-3 text-left transition-all ${
        selected
          ? "border-primary/60 bg-primary/10"
          : unlocked
            ? "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
            : "cursor-not-allowed border-white/5 bg-white/[0.01] opacity-50"
      } ${isRoot ? "ring-1 ring-white/5" : ""}`}
      style={selected ? { boxShadow: `0 0 0 1px hsl(${hue} 80% 60% / 0.3), 0 8px 30px hsl(${hue} 80% 40% / 0.15)` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: `hsl(${hue} 85% 66%)`, boxShadow: `0 0 8px hsl(${hue} 90% 60% / 0.7)` }}
          />
          <span className={`text-[13px] font-medium tracking-tight ${unlocked ? "text-white/90" : "text-white/50"}`}>
            {skill.name}
          </span>
        </div>
        {!unlocked ? (
          <Lock className="h-3 w-3 text-white/30" />
        ) : (
          <span className="font-mono text-[10px] tabular-nums text-white/40">L{skill.level}</span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <LevelBar level={skill.level} max={skill.maxLevel} hue={hue} />
        <span className={`font-mono text-[9px] uppercase tracking-wider ${MASTERY_TONE[mastery]}`}>
          {MASTERY_LABEL[mastery]}
        </span>
      </div>
    </button>
  )
}

/* ---- connector ---- */
function Connector() {
  return <div className="mx-auto h-3 w-px bg-gradient-to-b from-white/20 to-white/5" />
}

/* ---- a single category tree ---- */
function CategoryTree({
  root,
  all,
  selectedId,
  onSelect,
  onHover,
}: {
  root: SkillNode
  all: SkillNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onHover: (c: SkillCategory | null) => void
}) {
  const children = all.filter((s) => s.parent === root.id)
  const hue = CAT_HUE[root.category]

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0c14]/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: `hsl(${hue} 70% 70%)` }}>
          {CATEGORY_LABEL[root.category]}
        </span>
        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, hsl(${hue} 70% 55% / 0.4), transparent)` }} />
      </div>

      <SkillChip
        skill={root}
        all={all}
        selected={selectedId === root.id}
        onSelect={() => onSelect(root.id)}
        onHover={onHover}
      />
      {children.length > 0 && <Connector />}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {children.map((child) => {
          const leaves = all.filter((s) => s.parent === child.id)
          return (
            <div key={child.id} className="flex flex-col">
              <SkillChip
                skill={child}
                all={all}
                selected={selectedId === child.id}
                onSelect={() => onSelect(child.id)}
                onHover={onHover}
              />
              {leaves.map((leaf) => (
                <div key={leaf.id}>
                  <Connector />
                  <SkillChip
                    skill={leaf}
                    all={all}
                    selected={selectedId === leaf.id}
                    onSelect={() => onSelect(leaf.id)}
                    onHover={onHover}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---- inspector ---- */
function Inspector({
  skill,
  all,
  onUpgrade,
}: {
  skill: SkillNode
  all: SkillNode[]
  onUpgrade: (r: UpgradeResult) => void
}) {
  const hue = CAT_HUE[skill.category]
  const unlocked = isSkillUnlocked(skill, all)
  const maxed = skill.level >= skill.maxLevel
  const mastery = masteryForLevel(skill.level, skill.maxLevel)
  const caps = unlockedCapabilities(skill)
  const next = nextUnlock(skill)

  const doUpgrade = () => {
    const r = characterStore.upgradeSkill(skill.id)
    if (r) onUpgrade(r)
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#0b0c14]/60 p-5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${hue} 85% 66%)`, boxShadow: `0 0 10px hsl(${hue} 90% 60% / 0.8)` }} />
        <h3 className="text-lg font-semibold tracking-tight text-white">{skill.name}</h3>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-white/40">
          {CATEGORY_LABEL[skill.category]}
        </span>
      </div>
      <p className="mt-2 text-pretty text-[13px] leading-relaxed text-white/55">{skill.description}</p>

      {/* level */}
      <div className="mt-4 flex items-end justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Level</span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tabular-nums text-white">{skill.level}</span>
            <span className="font-mono text-sm text-white/30">/ {skill.maxLevel}</span>
          </div>
        </div>
        <span className={`font-mono text-[11px] uppercase tracking-wider ${MASTERY_TONE[mastery]}`}>
          {MASTERY_LABEL[mastery]}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-[3px]">
        {Array.from({ length: skill.maxLevel }).map((_, i) => (
          <span
            key={i}
            className="h-2 flex-1 rounded-[2px]"
            style={{
              background: i < skill.level ? `hsl(${hue} 85% 64%)` : "rgba(255,255,255,0.08)",
              boxShadow: i === skill.level - 1 ? `0 0 8px hsl(${hue} 90% 60% / 0.8)` : "none",
            }}
          />
        ))}
      </div>

      {/* unlocked capabilities */}
      {caps.length > 0 && (
        <div className="mt-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Unlocked</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {caps.map((c) => (
              <span key={c.capability} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-primary">
                <Sparkles className="h-3 w-3" /> {c.capability}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* next unlock */}
      {next && (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Next unlock · Level {next.level}</span>
          <p className="mt-1 text-[13px] font-medium text-white/85">{next.capability}</p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {next.abilities.map((a) => (
              <li key={a} className="flex items-center gap-1.5 text-[11px] text-white/45">
                <span className="h-1 w-1 rounded-full bg-white/30" /> {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* prerequisites lock */}
      {!unlocked && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/5 p-3 text-[12px] text-warn">
          <Lock className="h-3.5 w-3.5" />
          Develop its prerequisite to Level 3 to unlock this skill.
        </div>
      )}

      {/* upgrade CTA */}
      <div className="mt-auto pt-4">
        <button
          onClick={doUpgrade}
          disabled={!unlocked || maxed}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[hsl(250_80%_60%)] px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {maxed ? "Mastered" : (
            <>
              Upgrade to Level {skill.level + 1}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

/* ================================================================== */
export function SkillTree({
  worker,
  onHoverCategory,
  onUpgrade,
}: {
  worker: CharacterWorker
  onHoverCategory: (c: SkillCategory | null) => void
  onUpgrade: (r: UpgradeResult) => void
}) {
  const roots = worker.skills.filter((s) => s.tier === 0)
  const [selectedId, setSelectedId] = useState<string>(roots[0]?.id ?? "")
  const selected = worker.skills.find((s) => s.id === selectedId) ?? roots[0]

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {roots.map((root) => (
          <CategoryTree
            key={root.id}
            root={root}
            all={worker.skills}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onHover={onHoverCategory}
          />
        ))}
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        {selected && <Inspector skill={selected} all={worker.skills} onUpgrade={onUpgrade} />}
      </div>
    </div>
  )
}
