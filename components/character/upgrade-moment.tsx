"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import type { UpgradeResult } from "@/lib/character/character-store"
import { CATEGORY_LABEL, MASTERY_LABEL } from "@/lib/character/character-model"
import { FabricOrganism } from "./fabric-organism"

/**
 * The upgrade moment. When a skill levels up the worker visibly becomes
 * more — we hold the screen, morph the Fabric from its "before" to its
 * "after" state, and narrate exactly what changed. This is the emotional
 * center of the whole builder.
 */
export function UpgradeMoment({
  result,
  workerName,
  onClose,
}: {
  result: UpgradeResult | null
  workerName: string
  onClose: () => void
}) {
  const [phase, setPhase] = useState<"before" | "after">("before")

  useEffect(() => {
    if (!result) return
    setPhase("before")
    const t = setTimeout(() => setPhase("after"), 900)
    return () => clearTimeout(t)
  }, [result])

  if (!result) return null

  const strengthDelta = Math.round(result.strengthAfter - result.strengthBefore)
  const catDelta = Math.round(result.categoryAfter - result.categoryBefore)
  const leveledUp = result.workerLevelAfter > result.workerLevelBefore
  const masteryChanged = result.masteryAfter !== result.masteryBefore

  return (
    <AnimatePresence>
      <motion.div
        key="upgrade"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 px-5 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
            {/* the living transition */}
            <div className="relative min-h-[340px] border-b border-border bg-black/40 md:border-b-0 md:border-r">
              <FabricOrganism
                fabric={phase === "before" ? result.fabricBefore : result.fabricAfter}
                highlightCategory={phase === "after" ? result.category : null}
                showLabel={false}
                className="absolute inset-0"
              />
              <div className="pointer-events-none absolute left-4 top-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {phase === "before" ? "before" : "evolved"}
                </p>
              </div>
              <AnimatePresence>
                {phase === "after" && result.fabricEvolved && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-grow/40 bg-grow/10 px-3 py-1"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-grow">
                      fabric evolved
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* what changed */}
            <div className="flex flex-col gap-5 p-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
                  {leveledUp ? `${workerName} reached level ${result.workerLevelAfter}` : "skill advanced"}
                </p>
                <h2 className="mt-2 text-pretty text-2xl font-semibold leading-tight text-foreground">
                  {result.skillName}
                </h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {CATEGORY_LABEL[result.category]} · Lv {result.fromLevel} → Lv {result.toLevel}
                </p>
              </div>

              {masteryChanged && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.9 }}
                  className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    mastery
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {MASTERY_LABEL[result.masteryBefore]} → {MASTERY_LABEL[result.masteryAfter]}
                  </p>
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <DeltaStat label="Overall strength" from={Math.round(result.strengthBefore)} delta={strengthDelta} />
                <DeltaStat label={`${CATEGORY_LABEL[result.category]}`} from={Math.round(result.categoryBefore)} delta={catDelta} />
              </div>

              {result.newCapability && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.1 }}
                  className="rounded-lg border border-grow/40 bg-grow/10 p-3"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-grow">
                    new ability unlocked
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{result.newCapability.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {result.newCapability.description}
                  </p>
                </motion.div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-auto w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function DeltaStat({ label, from, delta }: { label: string; from: number; delta: number }) {
  const positive = delta > 0
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <motion.span
          key={from + delta}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="text-lg font-semibold text-foreground"
        >
          {from + delta}
        </motion.span>
        {delta !== 0 && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className={`font-mono text-xs font-medium ${positive ? "text-grow" : "text-muted-foreground"}`}
          >
            {positive ? "+" : ""}
            {delta}
          </motion.span>
        )}
      </div>
    </div>
  )
}
