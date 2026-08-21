"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — WORKER (orchestrator)
 * Not a dashboard. A single spatial environment where you create a
 * worker, watch it live, and shape it. Everything is contextual and
 * driven by real state; the fabric is always the hero.
 * ------------------------------------------------------------------ */

import { AnimatePresence } from "framer-motion"
import { useCallback, useMemo, useState } from "react"
import { CommandBar } from "@/components/command-bar"
import { CreateOverlay, ASSEMBLY_STEPS } from "@/components/create-overlay"
import { EvolveDrawer } from "@/components/evolve-drawer"
import { FabricCanvas } from "@/components/fabric-canvas"
import { Hud } from "@/components/hud"
import { ModeSwitcher } from "@/components/mode-switcher"
import { OutcomeOverlay } from "@/components/outcome-overlay"
import { RabbitHole } from "@/components/rabbit-hole"
import { TeachDrawer } from "@/components/teach-drawer"
import {
  addOrb,
  buildGraph,
  type Camera,
  setCapabilityScore,
} from "@/lib/fabric-graph"
import { useSimulation } from "@/lib/simulation"
import {
  ATLAS,
  type Capability,
  type CapabilityId,
  type FabricMode,
  type Interaction,
} from "@/lib/worker"

type Phase = "create" | "assembling" | "live"

/* Cinematic camera framing per mode — the deeper you go, the closer. */
const MODE_CAMERA: Record<FabricMode, Camera> = {
  outcome: { x: 0, y: 0, zoom: 0.68 },
  fabric: { x: 0, y: 0, zoom: 1 },
  watch: { x: 0, y: 0, zoom: 1.15 },
  trace: { x: -150, y: 0, zoom: 1.35 },
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("create")
  const [objective, setObjective] = useState("")
  const [assemblyStep, setAssemblyStep] = useState(0)
  const [revealCount, setRevealCount] = useState(0)

  const [mode, setMode] = useState<FabricMode>("fabric")
  const [interaction, setInteraction] = useState<Interaction>("none")
  const [teachSeed, setTeachSeed] = useState("")
  const [traceQuery, setTraceQuery] = useState("")
  const [focusCap, setFocusCap] = useState<CapabilityId | null>(null)

  // live worker capability state (mutated by teach/evolve/grow)
  const [caps, setCaps] = useState<Capability[]>(ATLAS.capabilities)

  // camera control: mode framing unless the user has taken over
  const [userCamera, setUserCamera] = useState<Camera | null>(null)
  const [cameraKey, setCameraKey] = useState(0)

  // one graph instance for the whole session (physics mutates it in place)
  const graph = useMemo(() => buildGraph(ATLAS.capabilities), [])

  const sim = useSimulation(phase === "live")

  const warnCaps = useMemo(
    () => caps.filter((c) => c.warning).map((c) => c.id),
    [caps],
  )
  const worker = useMemo(() => ({ ...ATLAS, capabilities: caps }), [caps])

  /* -------------------- CREATE -> cinematic birth -------------------- */
  const handleAssemble = useCallback((obj: string) => {
    setObjective(obj)
    setPhase("assembling")
    setAssemblyStep(0)
    setRevealCount(0)

    // step through assembly copy while revealing graph nodes in order
    ASSEMBLY_STEPS.forEach((s, i) => {
      setTimeout(() => {
        setAssemblyStep(i)
        setRevealCount(s.reveal === 999 ? 999 : s.reveal + 1)
      }, 500 + i * 460)
    })

    const total = 500 + ASSEMBLY_STEPS.length * 460
    setTimeout(() => {
      setRevealCount(999)
      setPhase("live")
      setMode("fabric")
    }, total + 500)
  }, [])

  /* ------------------------- interactions ---------------------------- */
  const openTeach = useCallback((seed: string) => {
    setTeachSeed(seed)
    setInteraction("teach")
  }, [])

  const applyTeach = useCallback(
    (capId: CapabilityId) => {
      addOrb(graph, capId)
      setCaps((prev) =>
        prev.map((c) =>
          c.id === capId
            ? { ...c, orbs: c.orbs + 1, score: Math.min(100, c.score + 6) }
            : c,
        ),
      )
    },
    [graph],
  )

  const applyEvolve = useCallback(
    (capId: CapabilityId, nextScore: number) => {
      addOrb(graph, capId)
      setCapabilityScore(graph, capId, nextScore)
      setCaps((prev) =>
        prev.map((c) =>
          c.id === capId
            ? { ...c, orbs: c.orbs + 1, score: nextScore, warning: false }
            : c,
        ),
      )
    },
    [graph],
  )

  const handleGrow = useCallback(() => {
    // "grow" adds mass to the strongest capability — a new skill
    const strongest = [...caps].sort((a, b) => b.score - a.score)[0]
    addOrb(graph, strongest.id)
    setCaps((prev) =>
      prev.map((c) => (c.id === strongest.id ? { ...c, orbs: c.orbs + 1 } : c)),
    )
  }, [caps, graph])

  /* --------------------------- camera -------------------------------- */
  const changeMode = useCallback((m: FabricMode) => {
    setMode(m)
    setUserCamera(null)
    setCameraKey((k) => k + 1)
    if (m !== "trace") setTraceQuery("")
  }, [])

  const cameraTarget = userCamera ?? MODE_CAMERA[mode]

  const activeCount = sim.activeTask ? 1 : 0
  const showFabricControls = phase === "live"

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background bg-substrate">
      {/* HERO — always present once born, framed by the current mode */}
      {phase !== "create" && (
        <FabricCanvas
          graph={graph}
          activation={sim.activation}
          latest={sim.latest}
          revealCount={revealCount}
          cameraTarget={cameraTarget}
          cameraKey={`${mode}-${cameraKey}`}
          focusCapId={focusCap}
          warnCaps={warnCaps}
          dense={mode === "trace"}
          onSelectCapability={setFocusCap}
          onUserCamera={() => setUserCamera(cameraTarget)}
        />
      )}

      {/* CREATE + cinematic assembly copy */}
      <CreateOverlay
        phase={phase}
        assemblyStep={assemblyStep}
        objective={objective}
        onAssemble={handleAssemble}
      />

      {/* contextual overlays per mode */}
      <AnimatePresence>
        {phase === "live" && mode === "outcome" && (
          <OutcomeOverlay key="outcome" worker={worker} />
        )}
        {phase === "live" && mode === "trace" && (
          <RabbitHole key="trace" log={sim.log} query={traceQuery} />
        )}
      </AnimatePresence>

      {/* minimal HUD — hidden in the immersive Rabbit Hole */}
      {phase === "live" && mode !== "trace" && (
        <Hud worker={worker} activeCount={activeCount} live={sim.running} />
      )}

      {/* bottom control cluster: mode switcher + command bar */}
      {showFabricControls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-5 pb-6 sm:pb-8">
          <ModeSwitcher mode={mode} onChange={changeMode} />
          <CommandBar
            mode={mode}
            traceQuery={traceQuery}
            onTraceQuery={setTraceQuery}
            onGrow={handleGrow}
            onTeach={openTeach}
            onEvolve={() => setInteraction("evolve")}
          />
        </div>
      )}

      {/* interaction drawers — float above the fabric, never leave it */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-5 pb-28 sm:pb-32">
        <AnimatePresence>
          {interaction === "teach" && (
            <TeachDrawer
              key="teach"
              seed={teachSeed}
              onClose={() => setInteraction("none")}
              onApply={applyTeach}
            />
          )}
          {interaction === "evolve" && (
            <EvolveDrawer
              key="evolve"
              caps={caps}
              onClose={() => setInteraction("none")}
              onApply={applyEvolve}
            />
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
