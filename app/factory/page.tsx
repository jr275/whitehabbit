import { Suspense } from "react"
import { AgentFactory } from "@/components/factory/agent-factory"

export default function FactoryPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-background" />}><AgentFactory /></Suspense>
}
