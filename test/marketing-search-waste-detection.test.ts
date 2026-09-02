/* ================================================================== *
 * CATEGORY A — Marketing Workforce V1: Search Waste Detection.
 *
 * Covers (product brief section 19): skill execution, heuristic
 * evaluation, marketing data normalization, tenant isolation. Real
 * Postgres, real LLM_DEV_MODE fixture (no live LLM credential needed —
 * same convention every other skill test in this suite already uses),
 * never a mocked assertion about what the code does.
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — Search Waste Detection", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    process.env.LLM_DEV_MODE = "true"
  })

  // ---- heuristic: deterministic intent classification ----
  it("classifySearchTermIntent: branded/high-intent/informational/irrelevant/unknown are all real, deterministic, keyword-rule outcomes — never an LLM call", async () => {
    const { classifySearchTermIntent } = await import("@/lib/marketing/heuristics")
    const brandPattern = /\b(acme)\b/i
    const base = { id: "t1", campaignId: "c", adGroupId: "a", matchType: "broad" as const, spend: 10, impressions: 100, conversions: 0, intent: "unknown" as const }

    expect(classifySearchTermIntent({ ...base, term: "acme pricing", clicks: 5 }, brandPattern)).toBe("branded")
    expect(classifySearchTermIntent({ ...base, term: "buy project management software", clicks: 5 }, brandPattern)).toBe("high_intent")
    expect(classifySearchTermIntent({ ...base, term: "how to manage a project", clicks: 5 }, brandPattern)).toBe("informational")
    expect(classifySearchTermIntent({ ...base, term: "free project templates", clicks: 5 }, brandPattern)).toBe("irrelevant")
    // Below the minimum click threshold — stays unknown, never guessed.
    expect(classifySearchTermIntent({ ...base, term: "buy project management software", clicks: 1 }, brandPattern)).toBe("unknown")
  })

  it("detectWasteOpportunities: never flags a branded term or a term with a real conversion, groups the rest by reason", async () => {
    const { detectWasteOpportunities } = await import("@/lib/marketing/heuristics")
    const terms = [
      { id: "t1", campaignId: "c", adGroupId: "a", term: "acme pricing", matchType: "phrase" as const, spend: 50, clicks: 10, impressions: 200, conversions: 0, intent: "branded" as const },
      { id: "t2", campaignId: "c", adGroupId: "a", term: "buy pm software", matchType: "phrase" as const, spend: 40, clicks: 8, impressions: 150, conversions: 2, intent: "high_intent" as const },
      { id: "t3", campaignId: "c", adGroupId: "a", term: "free pm templates", matchType: "broad" as const, spend: 30, clicks: 12, impressions: 300, conversions: 0, intent: "irrelevant" as const },
      { id: "t4", campaignId: "c", adGroupId: "a", term: "pm jobs", matchType: "broad" as const, spend: 20, clicks: 9, impressions: 250, conversions: 0, intent: "irrelevant" as const },
    ]
    const opportunities = detectWasteOpportunities(terms)
    // t1 (branded) and t2 (real conversion) must never appear.
    const allMatchedIds = opportunities.flatMap((o) => o.searchTermIds)
    expect(allMatchedIds).not.toContain("t1")
    expect(allMatchedIds).not.toContain("t2")
    expect(allMatchedIds.sort()).toEqual(["t3", "t4"])
    expect(opportunities[0].wastedSpend).toBe(50) // t3 (30) + t4 (20)
  })

  it("estimateImpact: real arithmetic — recoverable/wasted spend and CPA improvement are computed, never a fabricated point estimate", async () => {
    const { estimateImpact } = await import("@/lib/marketing/heuristics")
    const opportunities = [{ id: "waste_x", reason: "irrelevant_intent" as const, searchTermIds: ["t1"], matchedTerms: ["x"], wastedSpend: 100, recoverableSpend: 100, clicks: 20, suggestedAction: "add_negative_keyword" as const, candidateNegativeKeywords: ["x"] }]
    const totals = { spend: 1000, clicks: 200, impressions: 5000, conversions: 20, searchTermCount: 50 }
    const impact = estimateImpact(opportunities, totals)
    expect(impact.estimatedWastedSpendMonthly).toBe(100)
    expect(impact.potentialRecoverableSpendMonthly).toBe(100)
    // Real recomputation: (1000-20)/20 vs 1000/20 -> 100% removed here is
    // spend/conversions unchanged (100/1000=10% of spend removed, all non-converting).
    expect(impact.cpaImprovementPercentRange[0]).toBeGreaterThan(0)
    expect(impact.cpaImprovementPercentRange[1]).toBeGreaterThanOrEqual(impact.cpaImprovementPercentRange[0])
  })

  // ---- data normalization / DEMO boundary ----
  it("resolvePaidSearchDataset: honestly DEMO today (connector_google_ads is a real, disabled placeholder), and deterministic across calls", async () => {
    const { resolvePaidSearchDataset, isGoogleAdsConnected } = await import("@/lib/marketing/google-ads-data")
    expect(isGoogleAdsConnected()).toBe(false)
    const first = await resolvePaidSearchDataset()
    const second = await resolvePaidSearchDataset()
    expect(first.source).toBe("demo")
    expect(first.dataset.searchTerms.length).toBeGreaterThan(0)
    // Seeded PRNG — same numbers every call, never Math.random.
    expect(first.dataset.totals).toEqual(second.dataset.totals)
    // A real, honest label a UI must render — never silently omitted.
    expect(first.dataset.windowLabel).toMatch(/DEMO DATA/)
  })

  // ---- evaluate() ----
  it("evaluate(): real structural scores, not a fabricated 'AI intelligence score'", async () => {
    const { searchWasteDetectionSkill } = await import("@/lib/agent/skills/search-waste-detection")
    const fakeResult = {
      structured: {
        dataAnalyzed: { source: "demo" as const, searchTermCount: 100 },
        opportunitiesDetected: 2,
        recommendations: [{ opportunityId: "waste_a", wastedSpend: 50, requiresApproval: true }, { opportunityId: "waste_b", wastedSpend: 30, requiresApproval: true }],
      },
      summary: "test",
      sources: [],
    }
    const evaluation = searchWasteDetectionSkill.evaluate(fakeResult as never)
    expect(evaluation.qualityScore).toBeGreaterThan(0)
    expect(evaluation.breakdown.map((b) => b.label)).toEqual(["Data completeness", "Analysis quality", "Recommendation relevance", "Policy compliance"])
    expect(evaluation.breakdown.find((b) => b.label === "Policy compliance")?.score).toBe(100)
  })

  // ---- full, real skill execution + tenant isolation ----
  it("a real Worker execution produces a real WorkerOutput (search_waste_report), org-scoped — org B never sees it", async () => {
    const { createOrganization, upsertWorker, buildWorkerVersion, listRecentOutputs } = await import("@/lib/db/repo")
    const { executeTask } = await import("@/lib/agent/runtime")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")

    const orgA = await createOrganization(`SWD A ${randomUUID()}`)
    const orgB = await createOrganization(`SWD B ${randomUUID()}`)

    const worker = buildEmptyWorker(`worker_swd_${randomUUID()}`)
    worker.identity = { name: "Paid Media Specialist", role: "Test", description: "", persona: "", tone: [], accent: "#16a34a", initials: "PM" }
    worker.skills = [{ id: "skill_search_waste_detection", name: "Search Waste Detection", category: "marketing", outputType: "search_waste_report", enabled: true }]
    worker.tools = []
    await upsertWorker(worker, orgA.id, undefined)
    const definition = { identity: worker.identity, mission: worker.mission, objectives: worker.objectives, knowledge: worker.knowledge, skills: worker.skills, tools: worker.tools, integrations: worker.integrations, behaviors: worker.behaviors, channels: worker.channels, outcome: worker.outcome, autonomy: worker.autonomy }
    const version = await buildWorkerVersion(worker.id, orgA.id, definition, "swd-test")

    let finalType = ""
    for await (const event of executeTask({ worker: { ...worker, ...version.definition }, orgId: orgA.id, workerVersionId: version.id, skillId: "skill_search_waste_detection", input: { brandTerms: "acme" } })) {
      finalType = event.type
    }
    expect(finalType).toBe("task_completed")

    const outputsA = await listRecentOutputs(orgA.id, { workerId: worker.id, limit: 5 })
    expect(outputsA).toHaveLength(1)
    expect(outputsA[0].type).toBe("search_waste_report")
    expect(outputsA[0].status).toBe("completed")
    const structured = outputsA[0].structured as { dataAnalyzed: { source: string; searchTermCount: number }; intentBreakdown: Record<string, number> }
    expect(structured.dataAnalyzed.source).toBe("demo")
    expect(structured.dataAnalyzed.searchTermCount).toBeGreaterThan(0)
    expect(Object.values(structured.intentBreakdown).reduce((a, b) => a + b, 0)).toBe(structured.dataAnalyzed.searchTermCount)

    // Tenant isolation — org B's own query for this workerId sees nothing.
    const outputsB = await listRecentOutputs(orgB.id, { workerId: worker.id, limit: 5 })
    expect(outputsB).toHaveLength(0)
  })
})
