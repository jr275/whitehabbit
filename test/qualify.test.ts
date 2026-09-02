// CATEGORY A — pure runtime test (no external credentials, no DB): the deterministic qualification layer.
import { describe, expect, it } from "vitest"
import { qualifyAll, qualifyCandidate } from "@/lib/agent/pipeline/qualify"
import type { PipelineObjective, ResearchCandidate } from "@/lib/agent/pipeline/types"

const objective: PipelineObjective = { objective: "Find high-quality enterprise leads in Brazil", target: "Brazil", constraints: [], criteria: ["enterprise scale"], requestedActions: [] }

function candidate(overrides: Partial<ResearchCandidate> = {}): ResearchCandidate {
  return {
    id: "cand_0",
    company: "Acme Corp",
    website: "https://acme.example",
    industry: "Software",
    location: "São Paulo, Brazil",
    employeeRange: "1000-5000",
    evidence: "Acme Corp is an enterprise scale software company expanding operations.",
    source: "https://source.example/acme",
    confidence: 60,
    ...overrides,
  }
}

describe("qualifyCandidate — deterministic, explainable, no LLM", () => {
  it("scores a complete, well-matched candidate highly", () => {
    const result = qualifyCandidate(candidate(), objective)
    expect(result.qualificationScore).toBeGreaterThan(70)
    expect(result.missingInformation).toHaveLength(0)
    expect(result.qualificationReasons.length).toBeGreaterThan(0)
  })

  it("penalizes missing firmographic fields and lists them as missing information — never guessed", () => {
    const sparse = candidate({ industry: null, location: null, employeeRange: null, evidence: "", source: "" })
    const result = qualifyCandidate(sparse, objective)
    expect(result.missingInformation).toEqual(expect.arrayContaining(["industry", "location", "employeeRange"]))
    expect(result.qualificationScore).toBeLessThan(50)
  })

  it("scores a location mismatch lower than a location match, all else equal", () => {
    const matched = qualifyCandidate(candidate({ location: "Brazil" }), objective)
    const mismatched = qualifyCandidate(candidate({ location: "Germany" }), objective)
    expect(matched.qualificationScore).toBeGreaterThan(mismatched.qualificationScore)
  })

  it("is deterministic — the exact same input always yields the exact same output", () => {
    const a = qualifyCandidate(candidate(), objective)
    const b = qualifyCandidate(candidate(), objective)
    expect(a).toEqual(b)
  })

  it("never produces a score outside [0, 100]", () => {
    const worst = qualifyCandidate(candidate({ company: "", website: null, industry: null, location: null, employeeRange: null, evidence: "", source: "" }), objective)
    expect(worst.qualificationScore).toBeGreaterThanOrEqual(0)
    expect(worst.qualificationScore).toBeLessThanOrEqual(100)
  })

  it("qualifyAll preserves candidate count and order", () => {
    const candidates = [candidate({ id: "a" }), candidate({ id: "b" }), candidate({ id: "c" })]
    const results = qualifyAll(candidates, objective)
    expect(results.map((r) => r.candidateId)).toEqual(["a", "b", "c"])
  })
})
