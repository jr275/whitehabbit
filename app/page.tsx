"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — FRONT DOOR
 * You don't configure a tool. You state an outcome, and a whole
 * workforce assembles to pursue it. The homepage is the moment of
 * hiring: an outcome hero -> a cinematic workforce assembly -> the
 * Observatory (the living org). Powered by the demo Workforce layer.
 * ------------------------------------------------------------------ */

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { Assembly } from "@/components/home/assembly"
import { OutcomeHero } from "@/components/home/outcome-hero"
import { demoStore } from "@/lib/workforce-demo/store"

type Phase = "hero" | "assembling"

export default function Page() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("hero")
  const [outcome, setOutcome] = useState("")

  const handleCommit = useCallback((stated: string) => {
    demoStore.setAssembledFor(stated)
    setOutcome(stated)
    setPhase("assembling")
  }, [])

  const handleAssembled = useCallback(() => {
    router.push("/observatory")
  }, [router])

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background bg-substrate">
      {phase === "hero" && <OutcomeHero onAssemble={handleCommit} />}
      {phase === "assembling" && (
        <Assembly outcome={outcome} onComplete={handleAssembled} />
      )}
    </main>
  )
}
