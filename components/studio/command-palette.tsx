"use client"

/* Command Palette (Phase 8 §20-21, risks.md R-47) — the first real
 * implementation behind TopNav's ⌘K button, which previously dispatched
 * a synthetic keydown event into a listener that never existed. Real
 * global search (GET /api/v1/search, itself real, tenant-scoped SQL —
 * never a client-side filter over a fetched-once list) plus a small,
 * static set of real navigation commands. Deliberately does NOT expose
 * destructive/executable actions (approve/execute a Decision, etc.)
 * from the palette this pass — those already have a real, confirmed
 * flow in Mission Control/Decision Center; adding a second path to the
 * same mutation here, without its own confirmation step, was judged
 * more risk than the palette's value this pass (see ADR note). */

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Boxes,
  Factory,
  Gauge,
  GitBranch,
  Globe,
  History,
  Layers3,
  ListChecks,
  Network,
  PackageOpen,
  PlugZap,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import type { SearchResult } from "@/lib/search"

interface NavCommand {
  id: string
  label: string
  hint: string
  href: string
  icon: LucideIcon
}

const NAV_COMMANDS: NavCommand[] = [
  { id: "nav-overview", label: "Go to Overview", hint: "Workspace", href: "/", icon: Gauge },
  { id: "nav-mission", label: "Go to Mission Control", hint: "Workspace", href: "/mission", icon: Radar },
  { id: "nav-workers", label: "Go to Workers", hint: "Workspace", href: "/workforce", icon: Users },
  { id: "nav-outputs", label: "Go to Runs & Outputs", hint: "Workspace", href: "/outputs", icon: Activity },
  { id: "nav-live-agents", label: "Go to Live Agent Graph", hint: "Workspace", href: "/agents/live", icon: Boxes },
  { id: "nav-approvals", label: "Go to Approvals", hint: "Workspace", href: "/approvals", icon: ShieldCheck },
  { id: "nav-websites", label: "Go to Websites", hint: "Knowledge", href: "/websites", icon: Globe },
  { id: "nav-knowledge", label: "Go to Knowledge Graph", hint: "Knowledge", href: "/knowledge", icon: Network },
  { id: "nav-opportunities", label: "Go to Opportunities", hint: "Knowledge", href: "/opportunities", icon: Target },
  { id: "nav-decisions", label: "Go to Decision Center", hint: "Knowledge", href: "/intelligence/decisions", icon: ListChecks },
  { id: "nav-map", label: "Go to Intelligence Graph", hint: "Knowledge", href: "/intelligence/map", icon: GitBranch },
  { id: "nav-timeline", label: "Go to Intelligence Timeline", hint: "Knowledge", href: "/intelligence/timeline", icon: History },
  { id: "nav-studio", label: "Go to Worker Studio", hint: "Build", href: "/studio", icon: Workflow },
  { id: "nav-factory", label: "Go to Factory", hint: "Build", href: "/factory", icon: Factory },
  { id: "nav-library", label: "Go to Skills", hint: "Build", href: "/library", icon: Layers3 },
  { id: "nav-integrations", label: "Go to Integrations", hint: "Connect", href: "/integrations", icon: PlugZap },
  { id: "nav-observatory", label: "Go to Observatory", hint: "Observe", href: "/observatory", icon: Activity },
  { id: "nav-outcomes", label: "Go to Outcomes", hint: "Observe", href: "/outcomes", icon: PackageOpen },
  { id: "nav-evolve", label: "Go to Improve", hint: "Observe", href: "/evolve", icon: Sparkles },
]

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  entity: "Entity",
  opportunity: "Opportunity",
  page: "Page",
  decision: "Decision",
  worker: "Worker",
}

type PaletteItem = { kind: "command"; command: NavCommand } | { kind: "result"; result: SearchResult }

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [projectId, setProjectId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/projects/default")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setProjectId(body?.project?.id ?? null))
      .catch(() => setProjectId(null))
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    // The visible "Search ⌘K" button in TopNav can't synthesize a real,
    // trusted Cmd/Ctrl+K keydown — it fires this instead, a plain,
    // explicit open request, so the button and the real shortcut both
    // land on the same real state.
    function onOpenRequest() {
      setOpen(true)
    }
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("open-command-palette", onOpenRequest)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("open-command-palette", onOpenRequest)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setResults([])
      setActiveIndex(0)
      // let the panel mount before focusing
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const params = new URLSearchParams({ q: query.trim() })
    if (projectId) params.set("projectId", projectId)
    const timer = setTimeout(() => {
      fetch(`/api/v1/search?${params.toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((body) => setResults(body.results ?? []))
        .catch((err) => {
          if (err.name !== "AbortError") setResults([])
        })
        .finally(() => setSearching(false))
    }, 200) // real debounce — never a request per keystroke
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open, projectId])

  const filteredCommands = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return NAV_COMMANDS
    return NAV_COMMANDS.filter((c) => c.label.toLowerCase().includes(needle) || c.hint.toLowerCase().includes(needle))
  }, [query])

  const items: PaletteItem[] = useMemo(
    () => [...filteredCommands.map((command): PaletteItem => ({ kind: "command", command })), ...results.map((result): PaletteItem => ({ kind: "result", result }))],
    [filteredCommands, results],
  )

  useEffect(() => setActiveIndex(0), [items.length])

  function go(item: PaletteItem) {
    router.push(item.kind === "command" ? item.command.href : item.result.href)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = items[activeIndex]
      if (item) go(item)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 pt-[12vh]" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to…"
            aria-label="Command palette search"
            aria-activedescendant={items[activeIndex] ? `cmdk-${activeIndex}` : undefined}
            role="combobox"
            aria-expanded
            aria-controls="cmdk-list"
            className="w-full bg-transparent text-sm text-popover-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">ESC</kbd>
        </div>

        <ul id="cmdk-list" role="listbox" className="max-h-96 overflow-y-auto p-1.5">
          {searching && <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
          {items.length === 0 && !searching && <li className="px-3 py-6 text-center text-xs text-muted-foreground">No matches. Try a different term.</li>}
          {items.map((item, i) => {
            const active = i === activeIndex
            if (item.kind === "command") {
              const Icon = item.command.icon
              return (
                <li key={item.command.id} id={`cmdk-${i}`} role="option" aria-selected={active}>
                  <button onClick={() => go(item)} onMouseEnter={() => setActiveIndex(i)} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${active ? "bg-secondary text-foreground" : "text-popover-foreground hover:bg-secondary/60"}`}>
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.command.label}</span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{item.command.hint}</span>
                  </button>
                </li>
              )
            }
            return (
              <li key={`${item.result.type}:${item.result.id}`} id={`cmdk-${i}`} role="option" aria-selected={active}>
                <button onClick={() => go(item)} onMouseEnter={() => setActiveIndex(i)} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${active ? "bg-secondary text-foreground" : "text-popover-foreground hover:bg-secondary/60"}`}>
                  <span className="min-w-0 flex-1 truncate">{item.result.title}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{TYPE_LABEL[item.result.type]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
