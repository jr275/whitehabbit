"use client"

/* ------------------------------------------------------------------ *
 * Draft store — the single source of truth for a worker being
 * configured from a prefab (or created from scratch).
 *
 * Tracks which fields were customized vs. pre-built so the WORKER
 * READY screen can honestly show what came pre-built, what was
 * customized, and what is still optional. Changes are only ever
 * applied through explicit actions — never silently.
 * ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react"
import type { Autonomy, WorkerSpec } from "./spec-model"
import type { Extraction } from "./intent"
import { getPrefab } from "./prefabs"

const KEY = "wh.library.draft.v1"
const CREATED_KEY = "wh.library.created.v1"

interface DraftState {
  draft: WorkerSpec | null
  /** dot-paths of fields the user has customized this session */
  customized: string[]
  /** ids of workers the user has shipped */
  created: string[]
}

const canPersist = () => typeof window !== "undefined"

function load(): DraftState {
  if (!canPersist()) return { draft: null, customized: [], created: [] }
  try {
    const created = JSON.parse(localStorage.getItem(CREATED_KEY) ?? "[]") as string[]
    const raw = localStorage.getItem(KEY)
    if (!raw) return { draft: null, customized: [], created }
    const parsed = JSON.parse(raw) as { draft: WorkerSpec | null; customized: string[] }
    return { draft: parsed.draft, customized: parsed.customized ?? [], created }
  } catch {
    return { draft: null, customized: [], created: [] }
  }
}

class DraftStore {
  private state: DraftState = { draft: null, customized: [], created: [] }
  private listeners = new Set<() => void>()
  private hydrated = false

  hydrate() {
    if (this.hydrated) return
    this.hydrated = true
    this.state = load()
    this.emit()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.state

  private emit() {
    this.persist()
    this.state = { ...this.state }
    this.listeners.forEach((l) => l())
  }
  private persist() {
    if (!canPersist()) return
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ draft: this.state.draft, customized: this.state.customized }),
      )
      localStorage.setItem(CREATED_KEY, JSON.stringify(this.state.created))
    } catch {
      /* ignore quota */
    }
  }

  private mark(path: string) {
    if (!this.state.customized.includes(path)) {
      this.state.customized = [...this.state.customized, path]
    }
  }

  /* ---------------------------- actions -------------------------- */

  /** Begin configuring from a prefab (deep clone so edits stay local). */
  startFrom(prefabId: string) {
    const p = getPrefab(prefabId)
    if (!p) return
    this.state.draft = structuredClone(p)
    this.state.customized = []
    this.emit()
  }

  /** Begin from a blank scratch spec (used by from-scratch creation). */
  startScratch(base: WorkerSpec) {
    this.state.draft = structuredClone(base)
    this.state.customized = []
    this.emit()
  }

  setField<K extends keyof WorkerSpec>(key: K, value: WorkerSpec[K]) {
    if (!this.state.draft) return
    this.state.draft = { ...this.state.draft, [key]: value }
    this.mark(key as string)
    this.emit()
  }

  setAutonomy(a: Autonomy) {
    this.setField("autonomy", a)
  }

  setSpecialization(id: string) {
    if (!this.state.draft) return
    this.state.draft = { ...this.state.draft, activeSpecializationId: id }
    this.mark("activeSpecializationId")
    this.emit()
  }

  toggleToolApproval(toolId: string) {
    if (!this.state.draft) return
    this.state.draft = {
      ...this.state.draft,
      tools: this.state.draft.tools.map((t) =>
        t.id === toolId ? { ...t, requiresApproval: !t.requiresApproval } : t,
      ),
    }
    this.mark("tools")
    this.emit()
  }

  /** Apply an intent extraction (from text or voice) to the draft. */
  applyExtraction(e: Extraction) {
    if (!this.state.draft) return
    const d = structuredClone(this.state.draft)

    if (e.industry) {
      d.industry = e.industry
      this.mark("industry")
    }
    if (e.market) {
      d.targetAudience = d.targetAudience ?? null
      d.industry = d.industry ?? e.market
      this.mark("industry")
    }
    if (e.autonomy) {
      d.autonomy = e.autonomy
      this.mark("autonomy")
    }
    if (e.primaryKpi) {
      const rest = d.kpis.filter((k) => k.label !== e.primaryKpi)
      d.kpis = [{ id: "primary", label: e.primaryKpi, weight: "primary" }, ...rest.map((k) => ({ ...k, weight: "secondary" as const }))]
      if (e.secondaryKpi) {
        d.kpis = [
          d.kpis[0],
          { id: "secondary", label: e.secondaryKpi, weight: "secondary" },
          ...d.kpis.slice(1).filter((k) => k.label !== e.secondaryKpi),
        ]
      }
      this.mark("kpis")
    }
    if (e.approvals.length) {
      const existing = new Set(d.approvalPolicy.map((a) => a.label))
      e.approvals.forEach((label) => {
        if (!existing.has(label)) d.approvalPolicy.push({ id: label.toLowerCase().replace(/\s+/g, "-"), label })
      })
      this.mark("approvalPolicy")
    }
    if (e.focusSkills.length) {
      d.knowledgeSources = Array.from(new Set([...d.knowledgeSources]))
      this.mark("specializations")
    }
    // choose a specialization matching the industry when possible
    if (e.industry) {
      const match = d.specializations.find((s) =>
        e.industry === "B2B SaaS" ? s.id === "b2b-saas" : e.industry === "E-commerce" ? s.id === "ecommerce" : false,
      )
      if (match) {
        d.activeSpecializationId = match.id
        this.mark("activeSpecializationId")
      }
    }

    this.state.draft = d
    this.emit()
  }

  /** Mark the draft as shipped. */
  ship() {
    if (!this.state.draft) return
    if (!this.state.created.includes(this.state.draft.id)) {
      this.state.created = [...this.state.created, this.state.draft.id]
    }
    this.emit()
  }

  clear() {
    this.state.draft = null
    this.state.customized = []
    this.emit()
  }
}

export const draftStore = new DraftStore()

const SERVER_SNAPSHOT: DraftState = { draft: null, customized: [], created: [] }

export function useDraft() {
  const state = useSyncExternalStore(
    draftStore.subscribe,
    draftStore.getSnapshot,
    () => SERVER_SNAPSHOT,
  )
  return state
}
