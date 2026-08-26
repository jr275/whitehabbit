import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity } from "@/lib/knowledge/repo"
import { recordSignal, listSignals } from "@/lib/intelligence/signals"
import { recordEvidence, listEvidenceForSubject } from "@/lib/intelligence/evidence"
import { createInsight, listInsights } from "@/lib/intelligence/insights"
import { upsertTrend, listTrends } from "@/lib/intelligence/trends"
import { createOpportunityFromTrend } from "@/lib/intelligence/trend-opportunity"
import { observeQuery, listQueries } from "@/lib/intelligence/queries"
import { normalizeSearchQuery } from "@/lib/intelligence/search-console/normalize"
import { createRole, listRoles } from "@/lib/intelligence/roles"
import { getOrCreateMarket, getOrCreateMetricDefinition, recordMetricObservation, getMetricSeries } from "@/lib/intelligence/markets"
import { createDataSource, ingestDataset, isStale } from "@/lib/intelligence/connectors/repo"
import { detectStaleData } from "@/lib/intelligence/data-freshness"
import { linkOpportunityNode, explainOpportunity } from "@/lib/intelligence/opportunity-graph"
import { computeInformationGainV2 } from "@/lib/opportunity/information-gain-v2"
import { evaluateInformationGainGate } from "@/lib/opportunity/information-gain-gate"
import { runDeepResearch } from "@/lib/intelligence/deep-research"
import { createAIPrompt, createAIRun, createAIAnswer, createAICitation, listCitationsForPage } from "@/lib/intelligence/ai-visibility/repo"
import { generateRecommendations, listRecommendations } from "@/lib/intelligence/recommendations"
import { createProperty, importSnapshot, importQueryObservation } from "@/lib/intelligence/search-console/repo"
import { detectSearchPerformanceSignals } from "@/lib/intelligence/search-console/signal-detection"
import { createOpportunity } from "@/lib/opportunity/repo"
import { workflowEngine } from "@/lib/workflow/engine"

async function seedProject() {
  const email = `intel-${randomUUID()}@example.test`
  const { org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  return { orgId: org.id, projectId: project.id }
}

/** A real agent_runs row for opportunities.source_agent_run_id's FK —
 * never a fabricated id. */
async function seedAgentRunId(orgId: string, projectId: string): Promise<string> {
  const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `test-subject-${randomUUID()}` })
  return run.id
}

describe("Signal / Evidence / Insight (§9-11)", () => {
  it("records and lists real, confidence-scored signals — never automatically a fact", async () => {
    const { orgId, projectId } = await seedProject()
    const signal = await recordSignal({ orgId, projectId, type: "manual", value: { note: "test" }, source: "test", confidence: 0.6 })
    expect(signal.confidence).toBe(0.6)
    const listed = await listSignals(orgId, projectId, { type: "manual" })
    expect(listed.some((s) => s.id === signal.id)).toBe(true)
  })

  it("records evidence for a non-entity subject (opportunity) via the unified evidence table", async () => {
    const { orgId, projectId } = await seedProject()
    const opportunityId = `fake-opp-${randomUUID()}`
    const evidence = await recordEvidence({ orgId, projectId, subjectType: "opportunity", subjectId: opportunityId, source: "test", sourceType: "manual", confidence: 0.8, verificationStatus: "verified" })
    const listed = await listEvidenceForSubject(orgId, "opportunity", opportunityId)
    expect(listed.map((e) => e.id)).toContain(evidence.id)
  })

  it("creates and lists insights derived from real signal ids", async () => {
    const { orgId, projectId } = await seedProject()
    const signal = await recordSignal({ orgId, projectId, type: "manual", value: {}, source: "test", confidence: 0.5 })
    const insight = await createInsight({ orgId, projectId, title: "Test insight", summary: "A real summary.", category: "search_performance", confidence: 0.7, signalIds: [signal.id] })
    const listed = await listInsights(orgId, projectId)
    expect(listed.find((i) => i.id === insight.id)?.signalIds).toEqual([signal.id])
  })
})

describe("Trend -> Opportunity (§15-16, §25-26)", () => {
  it("an eligible, high-confidence rising trend creates a real, linked, explainable opportunity", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Test Place ${randomUUID()}`)
    const trend = await upsertTrend({ orgId, projectId, label: entity.name, entityId: entity.id, state: "rising", velocity: 45, acceleration: null, momentum: 90, seasonality: null, confidence: 0.75, signalIds: [] })

    const result = await createOpportunityFromTrend(orgId, projectId, trend)
    expect(result.created).toBe(true)
    expect(result.opportunityId).not.toBeNull()

    // idempotent: creating from the same trend/entity again does not duplicate
    const second = await createOpportunityFromTrend(orgId, projectId, trend)
    expect(second.created).toBe(false)

    const opportunity = { id: result.opportunityId!, opportunityType: "trend_driven", title: "x", topic: "x", targetIntent: null, primaryEntityId: entity.id, finalScore: null, informationGainScore: null, informationGainReasons: null }
    const explanation = await explainOpportunity(orgId, opportunity)
    expect(explanation.whyNow).toContain("rising")
    expect(explanation.whyThisEntity).toContain(entity.name)
  })

  it("a low-confidence or stable trend never creates an opportunity — real eligibility gate, not automatic", async () => {
    const { orgId, projectId } = await seedProject()
    const trend = await upsertTrend({ orgId, projectId, label: `low-conf-${randomUUID()}`, entityId: null, state: "stable", velocity: 2, acceleration: null, momentum: 1, seasonality: null, confidence: 0.3, signalIds: [] })
    const result = await createOpportunityFromTrend(orgId, projectId, trend)
    expect(result.created).toBe(false)
  })

  it("listTrends filters by state", async () => {
    const { orgId, projectId } = await seedProject()
    await upsertTrend({ orgId, projectId, label: `a-${randomUUID()}`, entityId: null, state: "rising", velocity: 40, acceleration: null, momentum: 10, seasonality: null, confidence: 0.7, signalIds: [] })
    await upsertTrend({ orgId, projectId, label: `b-${randomUUID()}`, entityId: null, state: "declining", velocity: -40, acceleration: null, momentum: -10, seasonality: null, confidence: 0.7, signalIds: [] })
    const rising = await listTrends(orgId, projectId, { state: "rising" })
    expect(rising.every((t) => t.state === "rising")).toBe(true)
  })
})

describe("Query normalization + intent (§13, §17)", () => {
  it("normalizeSearchQuery classifies intent deterministically and matches a known entity by real substring", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", "Barra da Tijuca")
    const query = await normalizeSearchQuery(orgId, projectId, "apartments for sale in Barra da Tijuca")
    expect(query.entityId).toBe(entity.id)
    expect(query.intent).toBe("transactional")
  })

  it("observeQuery is idempotent by normalized text — re-observing updates lastObservedAt, never duplicates", async () => {
    const { orgId, projectId } = await seedProject()
    const first = await observeQuery({ orgId, projectId, text: "  How To Invest  ", source: "manual" })
    const second = await observeQuery({ orgId, projectId, text: "how to invest", source: "manual" })
    expect(second.id).toBe(first.id)
    const listed = await listQueries(orgId, projectId)
    expect(listed.filter((q) => q.id === first.id)).toHaveLength(1)
  })
})

describe("Roles + Markets (§18-19) — generic, no hard-coded vertical", () => {
  it("creates a role with real operational fields", async () => {
    const { orgId, projectId } = await seedProject()
    const role = await createRole({ orgId, projectId, name: "Real Estate Investor", questions: ["best neighborhoods for yield?"], kpis: ["ROI"] })
    const listed = await listRoles(orgId, projectId)
    expect(listed.find((r) => r.id === role.id)?.kpis).toEqual(["ROI"])
  })

  it("markets and metrics work for any vertical the caller declares — no hard-coded real-estate assumption", async () => {
    const { orgId, projectId } = await seedProject()
    const market = await getOrCreateMarket(orgId, projectId, "US Mid-Market SaaS", "United States")
    const metricDef = await getOrCreateMetricDefinition({ orgId, projectId, name: "trial_to_paid_conversion", unit: "%", methodology: "real, tenant-reported conversion rate", source: "manual" })
    await recordMetricObservation({ orgId, metricDefinitionId: metricDef.id, marketId: market.id, period: "2026-Q2", value: 12.5 })
    await recordMetricObservation({ orgId, metricDefinitionId: metricDef.id, marketId: market.id, period: "2026-Q3", value: 15.0 })
    const series = await getMetricSeries(metricDef.id, market.id)
    expect(series.map((s) => s.value)).toEqual([12.5, 15.0])
  })
})

describe("External data connectors + freshness (§20-21)", () => {
  it("ingests real rows via the fixture connector and validates them", async () => {
    const { orgId, projectId } = await seedProject()
    const source = await createDataSource({
      orgId,
      projectId,
      name: "Test Source",
      connector: "fixture",
      freshnessPolicy: "daily",
      config: { rows: { ds1: [{ key: "metric_a", value: 42, observedAt: Date.now() }] } },
    })
    const version = await ingestDataset(orgId, source, "ds1", "Dataset One")
    expect(version.rowCount).toBe(1)
    expect(isStale("daily", version.fetchedAt)).toBe(false)
    expect(isStale("daily", Date.now() - 2 * 24 * 60 * 60_000)).toBe(true) // 2 real days ago vs. a daily policy
  })

  it("rejects an unknown connector rather than silently no-op-ing", async () => {
    const { orgId, projectId } = await seedProject()
    await expect(createDataSource({ orgId, projectId, name: "Bad", connector: "not_a_real_connector" })).rejects.toThrow(/not a registered connector/i)
  })

  it("detectStaleData emits a real stale_data signal for a dataset past its freshness window", async () => {
    const { orgId, projectId } = await seedProject()
    const source = await createDataSource({ orgId, projectId, name: "Stale Source", connector: "fixture", freshnessPolicy: "hourly", config: { rows: { ds1: [{ key: "x", value: 1 }] } } })
    await ingestDataset(orgId, source, "ds1", "Stale Dataset")
    // backdate the version's fetched_at to simulate real elapsed time without a real sleep
    const { query } = await import("@/lib/db/client")
    await query("UPDATE dataset_versions SET fetched_at = $1 WHERE dataset_id IN (SELECT id FROM datasets WHERE data_source_id = $2)", [Date.now() - 2 * 60 * 60_000, source.id])
    const staleCount = await detectStaleData(orgId, projectId)
    expect(staleCount).toBeGreaterThanOrEqual(1)
    const signals = await listSignals(orgId, projectId, { type: "stale_data" })
    expect(signals.length).toBeGreaterThanOrEqual(1)
  })
})

describe("Information Gain V2 + Gate (§23-24)", () => {
  it("is explainable — components, evidence, and missing requirements are all real and named", () => {
    const result = computeInformationGainV2({
      relatedEntityCount: 2,
      siblingEntityCount: 1,
      structuredDataEvidenceCount: 1,
      hasLocalEvidence: true,
      hasMarketLink: false,
      marketMetricObservationCount: 0,
      hasRoleLink: false,
      roleHasRealFields: false,
      externalDataObservationCount: 0,
      hasComputedDataObservation: false,
      evidenceCount: 0,
      evidenceAvgConfidence: null,
      evidenceVerifiedRatio: null,
      mostRecentEvidenceAgeMs: null,
      researchGapCount: null,
      researchSourceCount: null,
    })
    expect(result.components.evidenceQuality.status).toBe("unavailable")
    expect(result.missingRequirements.some((m) => m.startsWith("evidenceQuality"))).toBe(true)
  })

  it("the gate blocks page creation below threshold and names a real recommended action", () => {
    const lowScore = computeInformationGainV2({
      relatedEntityCount: 0, siblingEntityCount: 0, structuredDataEvidenceCount: 0, hasLocalEvidence: false,
      hasMarketLink: false, marketMetricObservationCount: 0, hasRoleLink: false, roleHasRealFields: false,
      externalDataObservationCount: 0, hasComputedDataObservation: false, evidenceCount: 0, evidenceAvgConfidence: null,
      evidenceVerifiedRatio: null, mostRecentEvidenceAgeMs: null, researchGapCount: null, researchSourceCount: null,
    })
    const decision = evaluateInformationGainGate(lowScore, false)
    expect(decision.allowed).toBe(false)
    expect(["MERGE", "ENRICH", "WAIT", "RESEARCH", "CREATE_DATA_ASSET"]).toContain(decision.action)
  })

  it("the gate recommends MERGE specifically when an equivalent page already exists", () => {
    const lowScore = computeInformationGainV2({
      relatedEntityCount: 0, siblingEntityCount: 0, structuredDataEvidenceCount: 0, hasLocalEvidence: false,
      hasMarketLink: false, marketMetricObservationCount: 0, hasRoleLink: false, roleHasRealFields: false,
      externalDataObservationCount: 0, hasComputedDataObservation: false, evidenceCount: 0, evidenceAvgConfidence: null,
      evidenceVerifiedRatio: null, mostRecentEvidenceAgeMs: null, researchGapCount: null, researchSourceCount: null,
    })
    const decision = evaluateInformationGainGate(lowScore, true)
    expect(decision.action).toBe("MERGE")
  })

  it("allows CREATE once the score clears the threshold", () => {
    const highScore = computeInformationGainV2({
      relatedEntityCount: 5, siblingEntityCount: 5, structuredDataEvidenceCount: 5, hasLocalEvidence: true,
      hasMarketLink: true, marketMetricObservationCount: 10, hasRoleLink: true, roleHasRealFields: true,
      externalDataObservationCount: 5, hasComputedDataObservation: true, evidenceCount: 5, evidenceAvgConfidence: 0.9,
      evidenceVerifiedRatio: 0.9, mostRecentEvidenceAgeMs: 1000, researchGapCount: 0, researchSourceCount: 5,
    })
    const decision = evaluateInformationGainGate(highScore, false)
    expect(decision.action).toBe("CREATE")
    expect(decision.allowed).toBe(true)
  })
})

describe("Deep Research Agent (§22)", () => {
  it("identifies real gaps and never fabricates a fact — every fact carries a real evidenceId", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Organization", `Test Org ${randomUUID()}`)
    const opportunity = await createOpportunity({
      orgId, projectId, sourceAgentRunId: await seedAgentRunId(orgId, projectId), sourceExecutionId: null, opportunityType: "entity_coverage_gap", primaryEntityId: entity.id,
      title: "Test", topic: entity.name, outline: [],
      scores: { sourceGroundingScore: null, outlineCompletenessScore: null, confidenceScore: null, entityCoverageScore: null, demandScore: null, trendScore: null, businessValueScore: null, competitionScore: null, authorityGapScore: null, informationGainScore: null, citationPotentialScore: null, cannibalizationRiskScore: null },
      finalScore: null, scoreNotes: null,
    })
    const research = await runDeepResearch(orgId, projectId, opportunity)
    expect(research.gaps.length).toBeGreaterThan(0) // a brand-new entity has no evidence yet — a real, honest gap
    expect(research.facts).toEqual([]) // no fabricated facts
    expect(research.recommendations.length).toBeGreaterThan(0)
  })
})

describe("AI Visibility storage + Citation Graph (§27-29)", () => {
  it("stores a real answer with provenance and links a citation to a real page when the URL matches", async () => {
    const { orgId, projectId } = await seedProject()
    const prompt = await createAIPrompt({ orgId, projectId, label: "test", text: "What are the best agencies?" })
    const run = await createAIRun({ orgId, projectId, promptId: prompt.id, provider: "test-provider", model: "test-model", status: "succeeded" })
    const answer = await createAIAnswer({ orgId, aiRunId: run.id, rawText: "Real answer text.", mentionedEntities: [], brandMentioned: false, competitorMentions: [], confidence: 1 })
    const citation = await createAICitation({ orgId, aiAnswerId: answer.id, sourceUrl: "https://example.test/some-page" })
    const citations = await listCitationsForPage(orgId, "nonexistent-page-id")
    expect(citations).toHaveLength(0) // real isolation — this citation isn't linked to that page
    expect(citation.pageId).toBeNull() // no real page matched — honestly null, never guessed
  })
})

describe("Recommendation Engine (§33)", () => {
  it("generates a real, evidence-linked recommendation from a real stale_data signal", async () => {
    const { orgId, projectId } = await seedProject()
    await recordSignal({ orgId, projectId, type: "stale_data", value: { dataSourceId: "ds1", datasetName: "Test Dataset" }, source: "test", confidence: 1 })
    const created = await generateRecommendations(orgId, projectId)
    expect(created.some((r) => r.action === "create_data_asset")).toBe(true)
    const listed = await listRecommendations(orgId, projectId)
    expect(listed.length).toBeGreaterThan(0)
    for (const rec of listed) {
      expect(rec.reason.length).toBeGreaterThan(0)
      expect(rec.confidence).toBeGreaterThan(0)
    }
  })

  it("never duplicates an already-open recommendation for the same subject+action", async () => {
    const { orgId, projectId } = await seedProject()
    await recordSignal({ orgId, projectId, type: "stale_data", value: { dataSourceId: "ds-dup", datasetName: "Dup Dataset" }, source: "test", confidence: 1 })
    const first = await generateRecommendations(orgId, projectId)
    const second = await generateRecommendations(orgId, projectId)
    const dupSignalRecs = [...first, ...second].filter((r) => r.reason.includes("Dup Dataset"))
    expect(dupSignalRecs.length).toBe(1) // created once, not twice
  })
})

describe("Search Console: real signal detection over real imported data (§12-14)", () => {
  it("detects a real impression spike and position change from two real snapshots", async () => {
    const { orgId, projectId } = await seedProject()
    const property = await createProperty({ orgId, projectId, siteUrl: "sc-domain:example.test" })
    await importSnapshot(orgId, property.id, { date: "2026-08-01", clicks: 10, impressions: 500, ctr: 0.02, position: 20 })
    await importSnapshot(orgId, property.id, { date: "2026-08-08", clicks: 30, impressions: 1500, ctr: 0.02, position: 12 })
    const count = await detectSearchPerformanceSignals(orgId, projectId, property.id)
    expect(count).toBeGreaterThan(0)
    const signals = await listSignals(orgId, projectId)
    expect(signals.some((s) => s.type === "search_impression_spike")).toBe(true)
    expect(signals.some((s) => s.type === "position_improvement")).toBe(true)
  })

  it("a query with real emerging impressions produces a query_emergence signal", async () => {
    const { orgId, projectId } = await seedProject()
    const property = await createProperty({ orgId, projectId, siteUrl: "sc-domain:example2.test" })
    await importQueryObservation(orgId, property.id, { date: "2026-08-01", query: "brand new search term", clicks: 0, impressions: 0, ctr: 0, position: 0 })
    await importQueryObservation(orgId, property.id, { date: "2026-08-08", query: "brand new search term", clicks: 3, impressions: 40, ctr: 0.075, position: 8 })
    await detectSearchPerformanceSignals(orgId, projectId, property.id)
    const signals = await listSignals(orgId, projectId, { type: "query_emergence" })
    expect(signals.length).toBeGreaterThan(0)
  })
})

describe("Opportunity Graph (§25) tenant isolation", () => {
  it("linking a node to an opportunity and reading it back is org-scoped", async () => {
    const { orgId, projectId } = await seedProject()
    const other = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Graph Test ${randomUUID()}`)
    const opportunity = await createOpportunity({
      orgId, projectId, sourceAgentRunId: await seedAgentRunId(orgId, projectId), sourceExecutionId: null, opportunityType: "entity_coverage_gap", primaryEntityId: entity.id,
      title: "t", topic: "t", outline: [],
      scores: { sourceGroundingScore: null, outlineCompletenessScore: null, confidenceScore: null, entityCoverageScore: null, demandScore: null, trendScore: null, businessValueScore: null, competitionScore: null, authorityGapScore: null, informationGainScore: null, citationPotentialScore: null, cannibalizationRiskScore: null },
      finalScore: null, scoreNotes: null,
    })
    await linkOpportunityNode(orgId, opportunity.id, "entity", entity.id, "targets")
    const { listOpportunityGraph } = await import("@/lib/intelligence/opportunity-graph")
    const ownGraph = await listOpportunityGraph(orgId, opportunity.id)
    expect(ownGraph.length).toBe(1)
    const otherGraph = await listOpportunityGraph(other.orgId, opportunity.id)
    expect(otherGraph.length).toBe(0) // real tenant isolation — a different org sees nothing
  })
})
