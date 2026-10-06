"use client"

/* ================================================================== *
 * ADAPTER BOUNDARY — the only place the surface learns where data
 * comes from.
 *
 * Every hook returns the same envelope shape a real fetch would:
 * { data, status, origin }. Components branch on `status`, never on
 * whether the value happens to be a literal, so replacing a body with
 * a real request is a change inside this file and nowhere else.
 *
 * They resolve synchronously today. That is deliberate: a fake latency
 * timer would make the demo feel slower AND would train the components
 * to expect a loading state that the real implementation may not have.
 * The `status` field exists so a real async version can use it without
 * a component rewrite; it is simply always "ready" right now.
 * ================================================================== */

import { useCallback, useMemo, useState } from "react"
import { CONCEPTS, CONNECTIONS, OBJECTS, OVERVIEW } from "./demo-data"
import type {
  DataOrigin,
  KnowledgeConcept,
  KnowledgeConnection,
  KnowledgeObject,
  KnowledgeOverview,
} from "./types"
import { deriveConnections } from "./connections"

export interface Resource<T> {
  data: T
  status: "loading" | "ready" | "error"
  origin: DataOrigin
}

/** Everything except the overview is still the prototype's own data,
 *  so it reports `demo` regardless of what the overview resolved to.
 *  Reading the origin off OVERVIEW would have quietly relabelled every
 *  sample theme and connection as live the moment the overview became
 *  live, which is the exact failure this field exists to prevent. */
function ready<T>(data: T): Resource<T> {
  return { data, status: "ready", origin: "demo" }
}

/**
 * The first hook whose data can be real.
 *
 * `initial` is resolved on the server (app/knowledge/page.tsx →
 * lib/knowledge/understand/live.ts) and handed in, rather than fetched
 * here. Two reasons, and the second is the important one:
 *
 *  1. No loading state and no flash. There is no moment where the
 *     surface shows the sample library's 428 saves to someone who has
 *     nine, which a client fetch with a demo placeholder would
 *     guarantee.
 *  2. The seam stays in one place. A component still asks this hook
 *     for the overview and still branches on `origin`; what changed is
 *     where the hook's answer comes from, which is exactly what this
 *     file exists to be able to change.
 *
 * Guests and signed-out visitors pass nothing and get the labelled
 * prototype, which is what the page was before and still is for them.
 */
export function useKnowledgeOverview(initial?: KnowledgeOverview | null): Resource<KnowledgeOverview> {
  return useMemo(() => {
    const data = initial ?? OVERVIEW
    return { data, status: "ready", origin: data.origin }
  }, [initial])
}


export function useKnowledgeConcepts(initial?: KnowledgeConcept[] | null): Resource<KnowledgeConcept[]> {
  return useMemo(
    () => (initial ? { data: initial, status: "ready", origin: "live" } : ready(CONCEPTS)),
    [initial],
  )
}

/** Live edges when the viewer's own objects and concepts are supplied,
 *  the sample otherwise. The fallback is what keeps the signed-out
 *  prototype intact; the live path is what stops a real library being
 *  drawn with fixture relationships. */
export function useKnowledgeConnections(
  objects?: KnowledgeObject[],
  concepts?: KnowledgeConcept[],
): Resource<KnowledgeConnection[]> {
  return useMemo(
    () => ready(objects && concepts ? deriveConnections(objects, concepts) : CONNECTIONS),
    [objects, concepts],
  )
}




export function useKnowledgeObjects(initial?: KnowledgeObject[] | null): Resource<KnowledgeObject[]> {
  return useMemo(
    () => (initial ? { data: initial, status: "ready", origin: "live" } : ready(OBJECTS)),
    [initial],
  )
}

/* ---- ask ------------------------------------------------------------ */
