import "server-only"

/* ================================================================== *
 * AI VISIBILITY — persistence (§27-29). Every AIAnswer/AICitation
 * carries real provenance (which prompt, which provider/model, when).
 * Never claims deterministic rankings — see runner.ts's header.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export interface AIPrompt {
  id: string
  orgId: string
  projectId: string
  label: string
  text: string
  createdAt: number
}

interface AIPromptRow {
  id: string
  org_id: string
  project_id: string
  label: string
  text: string
  created_at: string
}

function rowToPrompt(r: AIPromptRow): AIPrompt {
  return { id: r.id, orgId: r.org_id, projectId: r.project_id, label: r.label, text: r.text, createdAt: Number(r.created_at) }
}

export async function createAIPrompt(input: { orgId: string; projectId: string; label: string; text: string }): Promise<AIPrompt> {
  const id = `aiprompt_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO ai_prompts (id, org_id, project_id, label, text, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [id, input.orgId, input.projectId, input.label, input.text, now])
  return { id, orgId: input.orgId, projectId: input.projectId, label: input.label, text: input.text, createdAt: now }
}

export async function getAIPrompt(id: string, orgId: string): Promise<AIPrompt | null> {
  const row = await queryOne<AIPromptRow>("SELECT * FROM ai_prompts WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToPrompt(row) : null
}

export async function listAIPrompts(orgId: string, projectId: string): Promise<AIPrompt[]> {
  const rows = await query<AIPromptRow>("SELECT * FROM ai_prompts WHERE org_id = $1 AND project_id = $2 ORDER BY created_at DESC", [orgId, projectId])
  return rows.map(rowToPrompt)
}

export type AIRunStatus = "succeeded" | "failed" | "blocked"

export interface AIRun {
  id: string
  orgId: string
  projectId: string
  promptId: string
  provider: string
  model: string
  status: AIRunStatus
  error: string | null
  runAt: number
}

interface AIRunRow {
  id: string
  org_id: string
  project_id: string
  prompt_id: string
  provider: string
  model: string
  status: AIRunStatus
  error: string | null
  run_at: string
}

function rowToRun(r: AIRunRow): AIRun {
  return { id: r.id, orgId: r.org_id, projectId: r.project_id, promptId: r.prompt_id, provider: r.provider, model: r.model, status: r.status, error: r.error, runAt: Number(r.run_at) }
}

export async function createAIRun(input: { orgId: string; projectId: string; promptId: string; provider: string; model: string; status: AIRunStatus; error?: string | null }): Promise<AIRun> {
  const id = `airun_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO ai_runs (id, org_id, project_id, prompt_id, provider, model, status, error, run_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [
    id,
    input.orgId,
    input.projectId,
    input.promptId,
    input.provider,
    input.model,
    input.status,
    input.error ?? null,
    now,
  ])
  return { id, orgId: input.orgId, projectId: input.projectId, promptId: input.promptId, provider: input.provider, model: input.model, status: input.status, error: input.error ?? null, runAt: now }
}

export async function listAIRuns(orgId: string, promptId: string, limit = 20): Promise<AIRun[]> {
  const rows = await query<AIRunRow>("SELECT * FROM ai_runs WHERE org_id = $1 AND prompt_id = $2 ORDER BY run_at DESC LIMIT $3", [orgId, promptId, limit])
  return rows.map(rowToRun)
}

export interface AIAnswer {
  id: string
  orgId: string
  aiRunId: string
  rawText: string
  mentionedEntities: { entityId?: string; name: string; mentioned: boolean }[]
  brandMentioned: boolean
  competitorMentions: { name: string }[]
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null
  confidence: number
  createdAt: number
}

interface AIAnswerRow {
  id: string
  org_id: string
  ai_run_id: string
  raw_text: string
  mentioned_entities: { entityId?: string; name: string; mentioned: boolean }[]
  brand_mentioned: boolean
  competitor_mentions: { name: string }[]
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null
  confidence: number
  created_at: string
}

function rowToAnswer(r: AIAnswerRow): AIAnswer {
  return {
    id: r.id,
    orgId: r.org_id,
    aiRunId: r.ai_run_id,
    rawText: r.raw_text,
    mentionedEntities: r.mentioned_entities ?? [],
    brandMentioned: r.brand_mentioned,
    competitorMentions: r.competitor_mentions ?? [],
    sentiment: r.sentiment,
    confidence: r.confidence,
    createdAt: Number(r.created_at),
  }
}

export async function createAIAnswer(input: {
  orgId: string
  aiRunId: string
  rawText: string
  mentionedEntities: { entityId?: string; name: string; mentioned: boolean }[]
  brandMentioned: boolean
  competitorMentions: { name: string }[]
  sentiment?: "positive" | "neutral" | "negative" | "mixed" | null
  confidence: number
}): Promise<AIAnswer> {
  const id = `aianswer_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO ai_answers (id, org_id, ai_run_id, raw_text, mentioned_entities, brand_mentioned, competitor_mentions, sentiment, confidence, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, input.orgId, input.aiRunId, input.rawText, JSON.stringify(input.mentionedEntities), input.brandMentioned, JSON.stringify(input.competitorMentions), input.sentiment ?? null, input.confidence, now],
  )
  return { id, orgId: input.orgId, aiRunId: input.aiRunId, rawText: input.rawText, mentionedEntities: input.mentionedEntities, brandMentioned: input.brandMentioned, competitorMentions: input.competitorMentions, sentiment: input.sentiment ?? null, confidence: input.confidence, createdAt: now }
}

export async function getAIAnswer(id: string, orgId: string): Promise<AIAnswer | null> {
  const row = await queryOne<AIAnswerRow>("SELECT * FROM ai_answers WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToAnswer(row) : null
}

export async function listAIAnswersForRun(orgId: string, aiRunId: string): Promise<AIAnswer[]> {
  const rows = await query<AIAnswerRow>("SELECT * FROM ai_answers WHERE org_id = $1 AND ai_run_id = $2 ORDER BY created_at DESC", [orgId, aiRunId])
  return rows.map(rowToAnswer)
}

export interface AICitation {
  id: string
  orgId: string
  aiAnswerId: string
  sourceUrl: string
  pageId: string | null
  entityId: string | null
  createdAt: number
}

interface AICitationRow {
  id: string
  org_id: string
  ai_answer_id: string
  source_url: string
  page_id: string | null
  entity_id: string | null
  created_at: string
}

function rowToCitation(r: AICitationRow): AICitation {
  return { id: r.id, orgId: r.org_id, aiAnswerId: r.ai_answer_id, sourceUrl: r.source_url, pageId: r.page_id, entityId: r.entity_id, createdAt: Number(r.created_at) }
}

export async function createAICitation(input: { orgId: string; aiAnswerId: string; sourceUrl: string; pageId?: string | null; entityId?: string | null }): Promise<AICitation> {
  const id = `aicit_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO ai_citations (id, org_id, ai_answer_id, source_url, page_id, entity_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    id,
    input.orgId,
    input.aiAnswerId,
    input.sourceUrl,
    input.pageId ?? null,
    input.entityId ?? null,
    now,
  ])
  return { id, orgId: input.orgId, aiAnswerId: input.aiAnswerId, sourceUrl: input.sourceUrl, pageId: input.pageId ?? null, entityId: input.entityId ?? null, createdAt: now }
}

export async function listCitationsForAnswer(orgId: string, aiAnswerId: string): Promise<AICitation[]> {
  const rows = await query<AICitationRow>("SELECT * FROM ai_citations WHERE org_id = $1 AND ai_answer_id = $2", [orgId, aiAnswerId])
  return rows.map(rowToCitation)
}

/** "Which AI answers cite our pages?" (§29) — a real join, not a
 * fabricated report. */
export async function listCitationsForPage(orgId: string, pageId: string): Promise<AICitation[]> {
  const rows = await query<AICitationRow>("SELECT * FROM ai_citations WHERE org_id = $1 AND page_id = $2", [orgId, pageId])
  return rows.map(rowToCitation)
}
