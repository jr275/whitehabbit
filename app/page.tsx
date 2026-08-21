"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — WORKER (orchestrator)
 * Not a dashboard. A single spatial environment where you create a
 * worker, watch it work, and shape it. The Fabric is always the hero;
 * the live execution flows across it in real time and the worker keeps
 * working on its own — the user can sit back and watch.
 * ------------------------------------------------------------------ */

import { AnimatePresence, motion } from "framer-motion"
import { Sparkles } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ApprovalPanel } from "@/components/approval-panel"
import { CapabilityPanel } from "@/components/capability-panel"
import { CommandBar } from "@/components/command-bar"
import { CreateOverlay, ASSEMBLY_STEPS } from "@/components/create-overlay"
import { EventInspector } from "@/components/event-inspector"
import { EvolveDrawer } from "@/components/evolve-drawer"
import { ExplainPanel } from "@/components/explain-panel"
import { FabricCanvas } from "@/components/fabric-canvas"
import { Hud } from "@/components/hud"
import { ModeSwitcher } from "@/components/mode-switcher"
import { OutcomeCard } from "@/components/outcome-card"
import { OutcomeOverlay } from "@/components/outcome-overlay"
import { RabbitHole } from "@/components/rabbit-hole"
import { TaskHud } from "@/components/task-hud"
import { TaskQueue } from "@/components/task-queue"
import { TeachDrawer } from "@/components/teach-drawer"
import { WorkerIdentity } from "@/components/worker-identity"
import {
  addOrb,
  buildGraph,
  type Camera,
  getNodePos,
  setCapabilityScore,
} from "@/lib/fabric-graph"
import { useSimulation } from "@/lib/simulation"
import {
  ATLAS,
  type Capability,
  type CapabilityId,
  explain,
  type ExplainAnswer,
  type FabricMode,
  IDENTITY,
  type Interaction,
  type WorkerEvent,
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
  const [selectedEvent, setSelectedEvent] = useState<WorkerEvent | null>(null)
  const [queueOpen, setQueueOpen] = useState(false)

  // OS layers — surfaced contextually, never a permanent sidebar
  const [identityOpen, setIdentityOpen] = useState(false)
  const [inspectCap, setInspectCap] = useState<CapabilityId | null>(null)
  const [explainAnswer, setExplainAnswer] = useState<ExplainAnswer | null>(null)

  // live worker capability state (mutated by teach/evolve/grow)
  const [caps, setCaps] = useState<Capability[]>(ATLAS.capabilities)

  // camera control: mode framing, follow-the-signal, or user takeover
  const [autoFollow, setAutoFollow] = useState(true)
  const [userCamera, setUserCamera] = useState<Camera | null>(null)
  const [followCam, setFollowCam] = useState<Camera | null>(null)
  const [cameraKey, setCameraKey] = useState(0)

  // one graph instance for the whole session (physics mutates it in place)
  const graph = useMemo(() => buildGraph(ATLAS.capabilities), [])

  const sim = useSimulation(phase === "live")

  const warnCaps = useMemo(
    () => caps.filter((c) => c.warning).map((c) => c.id),
    [caps],
  )
  const worker = useMemo(() => ({ ...ATLAS, capabilities: caps }), [caps])

  const activePath = sim.exec?.activePath ?? []
  const activeCount = sim.queue.filter((q) => q.state === "running").length

  // progressive narrative for the current task (oldest -> newest)
  const narrative = useMemo(() => {
    if (!sim.exec) return []
    const tid = sim.exec.taskId
    return sim.log
      .filter((e) => e.taskId === tid && e.narrative)
      .slice(0, 5)
      .reverse()
      .map((e) => ({ id: e.id, text: e.narrative as string }))
  }, [sim.log, sim.exec])

  /* -------------------- CREATE -> cinematic birth -------------------- */
  const handleAssemble = useCallback((obj: string) => {
    setObjective(obj)
    setPhase("assembling")
    setAssemblyStep(0)
    setRevealCount(0)

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
      setMode("watch")
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
    const strongest = [...caps].sort((a, b) => b.score - a.score)[0]
    addOrb(graph, strongest.id)
    setCaps((prev) =>
      prev.map((c) => (c.id === strongest.id ? { ...c, orbs: c.orbs + 1 } : c)),
    )
  }, [caps, graph])

  /* ------------------- OS layers (contextual) ----------------------- */
  // clicking the CORE opens the worker's identity — the gateway inward
  const openIdentity = useCallback(() => {
    setInspectCap(null)
    setExplainAnswer(null)
    setIdentityOpen(true)
  }, [])

  // clicking a CAPABILITY node opens its inspection layer
  const handleSelectCapability = useCallback((id: CapabilityId | null) => {
    setFocusCap(id)
    if (id) {
      setIdentityOpen(false)
      setExplainAnswer(null)
      setInspectCap(id)
    } else {
      setInspectCap(null)
    }
  }, [])

  // asking the worker a question — routes into the explainability layer
  const handleExplain = useCallback((q: string) => {
    const ans = explain(q)
    if (!ans) return
    setIdentityOpen(false)
    setInspectCap(null)
    setExplainAnswer(ans)
    // spotlight the capabilities behind the answer
    if (ans.spotlight && ans.spotlight.length) {
      setFocusCap(ans.spotlight[0])
      setAutoFollow(false)
    }
  }, [])

  const jumpToEvolve = useCallback((capId?: CapabilityId) => {
    setExplainAnswer(null)
    if (capId) setFocusCap(capId)
    setInteraction("evolve")
  }, [])

  /* --------------------------- camera -------------------------------- */
  const changeMode = useCallback((m: FabricMode) => {
    setMode(m)
    setUserCamera(null)
    setSelectedEvent(null)
    setCameraKey((k) => k + 1)
    if (m !== "trace") setTraceQuery("")
  }, [])

  // follow the active capability while auto-follow is on (watch / fabric)
  useEffect(() => {
    if (!autoFollow || (mode !== "watch" && mode !== "fabric")) {
      setFollowCam(null)
      return
    }
    const cap = sim.exec?.currentCapability
    if (!cap) {
      setFollowCam({ x: 0, y: 0, zoom: mode === "watch" ? 1.15 : 1 })
    } else {
      const pos = getNodePos(graph, cap)
      if (pos) {
        // ease toward the node but keep the core partly in frame
        setFollowCam({ x: pos.x * 0.68, y: pos.y * 0.68, zoom: mode === "watch" ? 1.4 : 1.12 })
      }
    }
    setCameraKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.exec?.currentCapability, autoFollow, mode])

  const toggleFollow = useCallback(() => {
    setAutoFollow((v) => !v)
    setUserCamera(null)
    setCameraKey((k) => k + 1)
  }, [])

  const recenter = useCallback(() => {
    setUserCamera(null)
    setCameraKey((k) => k + 1)
  }, [])

  const onUserCamera = useCallback((cam: Camera) => {
    setAutoFollow(false)
    setUserCamera(cam)
  }, [])

  const cameraTarget = userCamera ?? followCam ?? MODE_CAMERA[mode]

  const showFabricControls = phase === "live"
  const showTaskHud = phase === "live" && (mode === "fabric" || mode === "watch")
  const currentOutcome = sim.exec?.outcome ?? null

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
          activePath={activePath}
          capStates={sim.capStates}
          dense={mode === "trace"}
          onSelectCapability={handleSelectCapability}
          onSelectCore={openIdentity}
          onUserCamera={() => onUserCamera(cameraTarget)}
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
          <RabbitHole
            key="trace"
            log={sim.log}
            query={traceQuery}
            selectedId={selectedEvent?.id ?? null}
            onSelect={setSelectedEvent}
          />
        )}
      </AnimatePresence>

      {/* minimal top HUD — hidden in the immersive Rabbit Hole */}
      {phase === "live" && mode !== "trace" && (
        <Hud
          worker={worker}
          activeCount={activeCount}
          status={sim.workerStatus}
          queueOpen={queueOpen}
          onActiveClick={() => setQueueOpen((v) => !v)}
        />
      )}

      {/* live task HUD — floats top-left over the fabric */}
      <div className="pointer-events-none absolute left-5 top-[68px] z-30 sm:left-7">
        <AnimatePresence>
          {showTaskHud && (
            <TaskHud
              key="taskhud"
              exec={sim.exec}
              workerStatus={sim.workerStatus}
              narrative={narrative}
              autoFollow={autoFollow}
              onToggleFollow={toggleFollow}
              onRecenter={recenter}
              onRunDemo={sim.runDemo}
              onReset={sim.reset}
            />
          )}
        </AnimatePresence>
      </div>

      {/* task queue — opens under the Active indicator */}
      <div className="pointer-events-none absolute right-5 top-[68px] z-30 sm:right-7">
        <AnimatePresence>
          {phase === "live" && mode !== "trace" && queueOpen && (
            <TaskQueue key="queue" queue={sim.queue} />
          )}
        </AnimatePresence>
      </div>

      {/* outcome card — earned by the execution sequence */}
      <div className="pointer-events-none absolute bottom-28 right-5 z-30 sm:bottom-32 sm:right-7">
        <AnimatePresence>
          {phase === "live" && mode !== "trace" && mode !== "outcome" && currentOutcome && (
            <OutcomeCard key={currentOutcome.title} outcome={currentOutcome} />
          )}
        </AnimatePresence>
      </div>

      {/* autonomy banner — intelligent, not aggressive */}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-5">
        <AnimatePresence>
          {phase === "live" && sim.autonomyBanner && (
            <motion.div
              key={sim.autonomyBanner}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-2 rounded-full border border-primary/30 bg-card/80 px-4 py-2 backdrop-blur-md"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                Autonomous action
              </span>
              <span className="hidden text-[12px] text-muted-foreground sm:inline">
                {sim.autonomyBanner}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* event inspector — click an event in the Rabbit Hole */}
      <div className="pointer-events-none absolute left-5 top-[68px] z-40 sm:left-7">
        <AnimatePresence>
          {mode === "trace" && selectedEvent && (
            <EventInspector
              key={selectedEvent.id}
              event={selectedEvent}
              decision={sim.exec?.decision ?? null}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </AnimatePresence>
      </div>

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
            onExplain={handleExplain}
          />
        </div>
      )}

      {/* OS layers — contextual panels reached by clicking into the worker */}
      <div className="pointer-events-none absolute right-5 top-[68px] z-40 sm:right-7">
        <AnimatePresence>
          {phase === "live" && identityOpen && (
            <WorkerIdentity
              key="identity"
              status={sim.workerStatus}
              activeCount={activeCount}
              autonomy={IDENTITY.autonomy}
              onClose={() => setIdentityOpen(false)}
              onTeach={() => {
                setIdentityOpen(false)
                openTeach("")
              }}
              onEvolve={() => {
                setIdentityOpen(false)
                setInteraction("evolve")
              }}
            />
          )}
          {phase === "live" && !identityOpen && inspectCap && (
            <CapabilityPanel
              key={`cap-${inspectCap}`}
              capId={inspectCap}
              cap={caps.find((c) => c.id === inspectCap)}
              onClose={() => handleSelectCapability(null)}
              onTeach={(id) => {
                handleSelectCapability(null)
                openTeach(`Improve ${caps.find((c) => c.id === id)?.name ?? "capability"}: `)
              }}
              onEvolve={() => jumpToEvolve(inspectCap)}
              onTrace={() => {
                handleSelectCapability(null)
                changeMode("trace")
              }}
            />
          )}
          {phase === "live" && explainAnswer && (
            <ExplainPanel
              key={explainAnswer.title}
              answer={explainAnswer}
              onClose={() => setExplainAnswer(null)}
              onCta={() => {
                if (/evolve/i.test(explainAnswer.cta ?? "")) jumpToEvolve(explainAnswer.spotlight?.[0])
                else if (/memory/i.test(explainAnswer.cta ?? "")) openIdentity()
                else if (explainAnswer.spotlight?.[0]) handleSelectCapability(explainAnswer.spotlight[0])
                setExplainAnswer(null)
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* APPROVAL — the worker pauses and waits for its manager.
          A centered spotlight with a soft backdrop; the fabric dims
          behind it so the whole environment defers to the decision. */}
      <AnimatePresence>
        {phase === "live" && sim.approval && (
          <motion.div
            key="approval-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/40 px-5 backdrop-blur-[2px]"
          >
            <ApprovalPanel
              approval={sim.approval}
              onApprove={sim.approve}
              onReject={sim.reject}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
