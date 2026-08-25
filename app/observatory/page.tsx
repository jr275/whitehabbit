import type { Metadata } from "next"
import { LiveObservatory } from "@/components/observatory/live-observatory"
import { getRuntimeMode } from "@/lib/runtime-mode"

export const metadata: Metadata = {
  title: "Observatory | WhiteHabbit",
  description: "Observe live AI workforce executions, costs, health, and guardrail events.",
}

export default function ObservatoryPage() {
  return <LiveObservatory runtimeMode={getRuntimeMode()} />
}
