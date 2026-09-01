"use client"

import {
  ArrowRight,
  Compass,
  CornerDownLeft,
  FolderPlus,
  Headphones,
  Heart,
  Link2,
  Search,
  Share2,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface Command {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  group: "Actions" | "Navigate"
}

const COMMANDS: Command[] = [
  { id: "save", label: "Save URL", hint: "Add a link to your library", icon: Link2, group: "Actions" },
  { id: "search", label: "Search knowledge", hint: "Find anything you've saved", icon: Search, group: "Actions" },
  { id: "ask", label: "Ask AI", hint: "Query your own memory", icon: Sparkles, group: "Actions" },
  { id: "collection", label: "Create collection", hint: "Group related pieces", icon: FolderPlus, group: "Actions" },
  { id: "listen", label: "Listen", hint: "Play your reading queue", icon: Headphones, group: "Actions" },
  { id: "research", label: "Research", hint: "Start a research thread", icon: Compass, group: "Actions" },
  { id: "share", label: "Share", hint: "Share a collection", icon: Share2, group: "Actions" },
  { id: "favorite", label: "Favorite", hint: "Mark current item", icon: Heart, group: "Actions" },
]

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function CommandPalette({ open, onClose, onSave }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    )
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  function run(cmd: Command) {
    onClose()
    if (cmd.id === "save") onSave()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(results.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1))
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault()
      run(results[active])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="kn-rise relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search…"
            className="h-14 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2 thin-scroll">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No commands found.</p>
          )}
          {results.map((cmd, i) => {
            const Icon = cmd.icon
            const isActive = i === active
            return (
              <button
                key={cmd.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(cmd)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  isActive ? "bg-secondary" : "hover:bg-secondary/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border",
                    isActive
                      ? "border-[var(--kn-ai)]/30 bg-[var(--kn-ai)]/10 text-[var(--kn-ai)]"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{cmd.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{cmd.hint}</span>
                </span>
                {isActive ? (
                  <CornerDownLeft className="size-3.5 text-muted-foreground" />
                ) : (
                  <ArrowRight className="size-3.5 text-muted-foreground/40" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
