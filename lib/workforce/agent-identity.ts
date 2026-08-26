import type { Worker } from "@/lib/workforce/model"
import { profileForWorker } from "@/lib/workforce/business-results"

export type AgentIdentity = {
  name: string
  role: string
  initials: string
  image: string
  accent: string
  status: Worker["status"]
}

export function agentIdentity(worker: Worker): AgentIdentity {
  const profile = profileForWorker(worker)
  return {
    name: worker.identity.name || "Unnamed agent",
    role: worker.identity.role || profile.label,
    initials: worker.identity.initials || worker.identity.name.slice(0, 2).toUpperCase() || "AI",
    image: profile.image,
    accent: worker.identity.accent || "#5a6ef0",
    status: worker.status,
  }
}

export function agentHealth(worker: Worker) {
  const enabledSkills = worker.skills.filter((skill) => skill.enabled).length
  const connectedTools = worker.tools.filter((tool) => tool.enabled && tool.connected).length
  const requiredTools = worker.tools.filter((tool) => tool.enabled).length
  const completeness = [worker.identity.name, worker.mission, worker.outcome.primaryKPI].filter(Boolean).length
  return {
    enabledSkills,
    connectedTools,
    requiredTools,
    readiness: Math.round(((completeness / 3) * 0.45 + (enabledSkills ? 0.25 : 0) + (requiredTools ? connectedTools / requiredTools : 1) * 0.3) * 100),
  }
}
