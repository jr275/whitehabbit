# ADR-028: AI Visibility — real prompts to a real LLM provider, never claiming deterministic rankings

## Status
Accepted.

## Context
The brief requires tracking how AI systems (ChatGPT-like assistants) mention/cite a tenant's brand and content, explicitly forbidding a claim of "deterministic AI rankings" — a single LLM answer is inherently non-deterministic and must never be treated as ground truth.

## Decision
`lib/intelligence/ai-visibility/runner.ts#runAIVisibilityPrompt()` calls the exact same provider-agnostic `callLlm()` (`lib/agent/tools/llm.ts`) every other agent in this codebase uses — never a direct provider SDK call, never a fabricated response. A real, configured LLM credential is required; absent one, the call honestly fails (`AIVisibilityBlockedError`, surfaced as a real 503) rather than returning a synthetic answer — the same discipline `lib/content-pipeline/draft.ts`'s `DraftBlockedError` already established for the Writer step.

Mention/citation detection is real substring/regex matching against the model's actual raw text: entity mentions are checked against the project's own real canonical entity names; citation URLs are extracted with a real regex and matched against real published pages via `resolvePublishedPage()`. Sentiment classification is explicitly **not** implemented — `AIAnswer.sentiment` is always `null` in this revision, because a real sentiment classifier would need either a second LLM call (adding real cost/latency to every visibility check, not yet justified) or a naive keyword heuristic that could misclassify with unearned confidence — neither is better than an honest `null`.

Every `AIRun` records its real provider/model/status, and every prompt can be re-run — repeated runs accumulate as real, timestamped observations (`AIAnswer` rows), never treated as a single definitive result. `GET /api/v1/ai-visibility/prompts/:id/answers` returns the full real history, not just the latest.

The Citation Graph (§29) is a real join: `AI Answer → Citation → Source Page` (`ai_citations.page_id`, set only on a real URL match) and, transitively, `Source Page → Entity` via the page's own `page_brief.primary_entity_id` — enabling "which AI answers cite our pages" as a real query, not a fabricated report.

## Consequences
- Positive: `tests/integration/intelligence-layer.test.ts` proves a citation to an unmatched URL is honestly `pageId: null`, never a guessed match.
- Positive: this genuinely works today wherever `LLM_DEV_MODE` is off and a real provider is configured — no additional infrastructure needed, since it reuses the existing provider abstraction entirely.
- Negative: competitor detection requires the caller to supply real, known competitor names (`opts.competitorNames`) — this codebase does not (yet) maintain a tenant's own competitor list as first-class data, so competitor mentions can only be checked for names a caller already knows to ask about, never automatically discovered.
- Negative: no sentiment signal exists yet (see above) — any product surface that wants to show "positive/negative" AI sentiment about a brand cannot do so honestly from this revision's data. Named as real future work requiring its own confidence discipline, not silently faked with a keyword heuristic.
