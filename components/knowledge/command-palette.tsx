"use client"

import {
  ArrowRight,
  BookOpen,
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
import { useT } from "./i18n"

interface Command {
  id: string
  icon: LucideIcon
  group: "actions" | "navigate"
  labelKey: keyof ReturnType<typeof useT>["palette"]["cmd"]
  hintKey: keyof ReturnType<typeof useT>["palette"]["cmd"]
  href?: string
}

// Only real, wired destinations/actions — nothing that pretends to do
// something we haven't built.
const COMMANDS: Command[] = [
  { id: "save", labelKey: "save", hintKey: "saveHint", icon: Link2, group: "actions" },
  { id: "nav-library", labelKey: "library", hintKey: "libraryHint", icon: BookOpen, group: "navigate", href: "/knowledge/library" },
  { id: "nav-favorites", labelKey: "favorites", hintKey: "favoritesHint", icon: Heart, group: "navigate", href: "/knowledge/favorites" },
  { id: "nav-topics", labelKey: "topics", hintKey: "topicsHint", icon: Layers, group: "navigate", href: "/knowledge/topics" },
  { id: "nav-ask", labelKey: "ask", hintKey: "askHint", icon: Sparkles, group: "navigate", href: "/knowledge/ai" },
  { id: "nav-home", labelKey: "home", hintKey: "homeHint", icon: Home, group: "navigate", href: "/knowledge" },
]

const DEBOUNCE_MS = 220

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function CommandPalette({ open, onClose, onSave }: CommandPaletteProps) {
  const t = useT()
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

  /* Matched against the TRANSLATED text, not the key. Someone typing
   * "biblioteca" is looking for "Ir para a Biblioteca", and a filter
   * over the English source would find nothing — a search box that
   * silently fails on the language the screen is in. */
  const commandMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (c) =>
        t.palette.cmd[c.labelKey].toLowerCase().includes(q) || t.palette.cmd[c.hintKey].toLowerCase().includes(q),
    )
  }, [query, t])

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
        // The palette is a jump list, not a results page: it shows
        // titles only, so it takes the items and leaves the evidence.
        const { items } = await searchLibrary(q, ctrl.signal)
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
      aria-label={t.palette.label}
    >
      <button
        aria-label={t.palette.closeLabel}
        className="absolute inset-0 bg-[oklch(0.185_0.022_268_/_28%)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="kn-rise relative w-full max-w-xl overflow-hidden rounded-[var(--pk-r-lg)] border border-[var(--pk-rule-2)] bg-[var(--pk-raised)] shadow-[0_24px_64px_-16px_oklch(0.185_0.022_268_/_18%)]">
        <div className="flex items-center gap-3 border-b border-[var(--pk-rule)] px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={voiceBusy ? voice.interimTranscript || (voice.state === "listening" ? t.palette.listening : t.palette.processing) : query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            readOnly={voiceBusy}
            placeholder={t.palette.placeholder}
            className={cn(
              "h-14 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground",
              voiceBusy && "text-muted-foreground",
            )}
          />
          {searching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
          <VoiceSearchButton voice={voice} className="shrink-0" />
          <kbd className="pk-label shrink-0">
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
              <p                 className="pk-label px-3 pb-2 pt-2.5">
                {hasQuery ? t.palette.commands : t.palette.quickActions}
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
                      "flex w-full items-center gap-3 rounded-[var(--pk-r-sm)] px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-[var(--pk-sunken)]" : "",
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", isActive ? "text-[var(--pk-ink)]" : "text-[var(--pk-ink-4)]")}
                      strokeWidth={1.9}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[var(--pk-ink)]">{t.palette.cmd[cmd.labelKey]}</span>
                      <span className="pk-meta block truncate">{t.palette.cmd[cmd.hintKey]}</span>
                    </span>
                    {isActive ? (
                      <CornerDownLeft className="size-3.5 text-[var(--pk-ink-4)]" />
                    ) : (
                      <ArrowRight className="size-3.5 text-[var(--pk-rule-2)]" />
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* Real library results */}
          {results.length > 0 && (
            <>
              <p className="pk-label px-3 pb-2 pt-3.5">{t.palette.inYourLibrary}</p>
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
                      "flex w-full items-center gap-3 rounded-[var(--pk-r-sm)] px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-[var(--pk-sunken)]" : "",
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", isActive ? "text-[var(--pk-ink)]" : "text-[var(--pk-ink-4)]")}
                      strokeWidth={1.9}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[var(--pk-ink)]">{item.title}</span>
                      <span className="pk-meta block truncate">{item.source}</span>
                    </span>
                    {isActive ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-[var(--pk-ink-4)]" />
                    ) : (
                      <ArrowRight className="size-3.5 shrink-0 text-[var(--pk-rule-2)]" />
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* Honest empty search state */}
          {showNoResults && (
            <div className="px-3 py-8 text-center">
              <p className="text-[14px] text-[var(--pk-ink)]">{t.palette.noMatches(query.trim())}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.palette.searchScope}
              </p>
            </div>
          )}

          {commandMatches.length === 0 && !hasQuery && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t.palette.noCommands}</p>
          )}
        </div>
      </div>
    </div>
  )
}
