"use client"

import {
  ArrowRight,
  BookOpen,
  Compass,
  CornerDownLeft,
  Heart,
  Home,
  Layers,
  Link2,
  Loader2,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { KIND_META } from "@/lib/knowledge/config"
import { searchLibrary } from "@/lib/knowledge/client"
import { useVoiceSearch } from "@/lib/knowledge/use-voice-search"
import type { KnowledgeItem } from "@/lib/knowledge/types"
import { VoiceSearchButton } from "./voice-search-button"

interface Command {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  group: "Actions" | "Navigate"
  href?: string
}

// Only real, wired destinations/actions — nothing that pretends to do
// something we haven't built.
const COMMANDS: Command[] = [
  { id: "save", label: "Save a URL", hint: "Add a link to your library", icon: Link2, group: "Actions" },
  { id: "nav-library", label: "Go to Library", hint: "All your saved knowledge", icon: BookOpen, group: "Navigate", href: "/knowledge/library" },
  { id: "nav-favorites", label: "Go to Favorites", hint: "The ones you starred", icon: Heart, group: "Navigate", href: "/knowledge/favorites" },
  { id: "nav-topics", label: "Go to Topics", hint: "Themes across your library", icon: Layers, group: "Navigate", href: "/knowledge/topics" },
  { id: "nav-explore", label: "Go to Explore", hint: "Concepts, connections & insights", icon: Compass, group: "Navigate", href: "/knowledge/explore" },
  { id: "nav-ask", label: "Go to Ask", hint: "Ask your knowledge", icon: Sparkles, group: "Navigate", href: "/knowledge/ai" },
  { id: "nav-home", label: "Go to Home", hint: "Your library overview", icon: Home, group: "Navigate", href: "/knowledge" },
]

const DEBOUNCE_MS = 220

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function CommandPalette({ open, onClose, onSave }: CommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<KnowledgeItem[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Voice search — a browser capability wired to the same query state, so a
  // final transcript flows through the existing debounced search exactly as
  // typed input would. See lib/knowledge/voice-search.ts for the real state
  // machine; this component only reads its state and calls start()/stop().
  const voice = useVoiceSearch((transcript) => setQuery(transcript))
  const voiceBusy = voice.state === "listening" || voice.state === "processing"

  const commandMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q))
  }, [query])

  // A flat, ordered list of everything selectable — commands first,
  // then real library results — so arrow keys + Enter traverse both.
  const flat = useMemo(
    () => [
      ...commandMatches.map((c) => ({ type: "command" as const, command: c })),
      ...results.map((item) => ({ type: "item" as const, item })),
    ],
    [commandMatches, results],
  )

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      setResults([])
      setSearching(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (voiceBusy) {
      // Never leave the mic listening once the palette is dismissed.
      voice.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => setActive(0), [query])

  // Real, debounced search over saved items. Aborts the in-flight
  // request whenever the query changes so results never arrive stale.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const items = await searchLibrary(q, ctrl.signal)
        if (!ctrl.signal.aborted) setResults(items)
      } catch {
        if (!ctrl.signal.aborted) setResults([])
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [query])

  function runCommand(cmd: Command) {
    onClose()
    if (cmd.id === "save") onSave()
    else if (cmd.href) router.push(cmd.href)
  }

  function openItem(item: KnowledgeItem) {
    onClose()
    router.push(`/knowledge/read/${item.id}`)
  }

  function runAt(i: number) {
    const entry = flat[i]
    if (!entry) return
    if (entry.type === "command") runCommand(entry.command)
    else openItem(entry.item)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(flat.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (i - 1 + flat.length) % Math.max(flat.length, 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      runAt(active)
    }
  }

  if (!open) return null

  const hasQuery = query.trim().length >= 2
  const showNoResults = hasQuery && !searching && results.length === 0
  let cursor = -1 // running index into `flat` as we render sections

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette and library search"
    >
      <button
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="kn-rise relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={voiceBusy ? voice.interimTranscript || (voice.state === "listening" ? "Listening…" : "Processing…") : query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            readOnly={voiceBusy}
            placeholder="Search your library or type a command…"
            className={cn(
              "h-14 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground",
              voiceBusy && "text-muted-foreground",
            )}
          />
          {searching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
          <VoiceSearchButton voice={voice} className="shrink-0" />
          <kbd className="shrink-0 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        {voice.message && (
          <p role="status" className="border-b border-border px-4 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {voice.message}
          </p>
        )}

        <div className="max-h-[52vh] overflow-y-auto p-2 thin-scroll">
          {/* Commands */}
          {commandMatches.length > 0 && (
            <>
              <p                 className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
                {hasQuery ? "Commands" : "Quick actions"}
              </p>
              {commandMatches.map((cmd) => {
                cursor += 1
                const i = cursor
                const Icon = cmd.icon
                const isActive = i === active
                return (
                  <button
                    key={cmd.id}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => runCommand(cmd)}
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
            </>
          )}

          {/* Real library results */}
          {results.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">
                In your library
              </p>
              {results.map((item) => {
                cursor += 1
                const i = cursor
                const isActive = i === active
                const Icon = KIND_META[item.kind].icon
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => openItem(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-secondary" : "hover:bg-secondary/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                        isActive
                          ? "border-[var(--kn-ai)]/30 bg-[var(--kn-ai)]/10 text-[var(--kn-ai)]"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {item.source}
                      </span>
                    </span>
                    {isActive ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* Honest empty search state */}
          {showNoResults && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm text-foreground">No saved items match “{query.trim()}”.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Search looks through titles, sources, tags and the extracted text of what you&apos;ve saved.
              </p>
            </div>
          )}

          {commandMatches.length === 0 && !hasQuery && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No commands found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
