# ADR-008: AI provider abstraction — already built, extend rather than replace

## Status
Accepted (documents an existing decision; no change in this revision).

## Context
`lib/agent/tools/llm-providers/*` already implements the brief's §50
requirement: a provider-agnostic `generate()`-shaped interface with real
Anthropic and Gemini adapters, selected via `LLM_PROVIDER`, plus an honestly-
labeled local development fixture (`LLM_DEV_MODE`) that is hard-blocked in
production (`VERCEL_ENV=production`) regardless of the flag — so a real
deployment can never silently serve simulated output. `lib/agent/cost.ts`
computes real cost from real token counts and a configured $/token rate,
returning `undefined` (not `0`) when no rate is configured, so "unmeasured"
is never confused with "free." No domain code (skills) imports a provider
SDK directly — every skill calls `tool_llm` through `runToolAction()`.

## Decision
Keep this abstraction as-is; new domains (Opportunity scoring, future
FactCheck/Quality agents) call the existing `tool_llm`/`callLlm` path, never
a provider SDK directly. Model routing (§49: cheap model for classification,
strong model for reasoning) is not yet implemented — today every skill uses
whatever `LLM_MODEL`/provider default is configured, with no per-task model
selection. This is deferred, not designed away: tracked in
`docs/architecture/risks.md` R-8, to be built when a second, cheaper task
(e.g. entity-name deduplication in `lib/knowledge`) actually needs a
cheaper model than the reasoning-heavy skills do.

An `EmbeddingProvider`/`RerankerProvider` interface (§50) does not exist yet
— there is no embedding-consuming feature (see ADR-009).

## Consequences
- Positive: no rework needed for this revision's Opportunity scoring, which
  deliberately does not call an LLM at all (ADR-006's components are
  computed from already-produced structured data, not a new prompt) —
  keeping the provider surface exactly as small as the brief's §49 "never
  use the most expensive model for every task" implies.
- Negative: model routing and embedding/reranker interfaces remain
  aspirational until a real consumer exists; listed in the risk register
  rather than stubbed out unused.
