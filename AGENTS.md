<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# WhiteHabbit — permanent rules

Operational rules that hold across every session. Current-state detail
lives in `docs/`; this file is the short list an agent reads first.

The block above is written and re-added by `next dev`. Leave it alone;
everything outside its markers is preserved on regeneration.

## 0. Precedence

When sources disagree, higher wins:

1. System / platform instructions
2. The user's explicit instructions in the current task
3. This file
4. `docs/` (architecture and operations detail)
5. Local conventions in the surrounding code

A conflict between this file and the code is a finding to report, not
something to resolve silently.

## 1. Architecture

- One Next.js 16 App Router application. No monorepo, no second app.
- Two products share the repo and must not import each other:
  - **Knowledge** — `app/knowledge`, `app/api/knowledge`,
    `components/knowledge`, `lib/knowledge`
  - **Workforce** — `lib/agent`, `lib/workforce`, `lib/workforce-demo`,
    `lib/worker`, `lib/products`, `lib/character`, `lib/insights`,
    `lib/library`, `lib/fabric-graph`, `lib/simulation`, and the
    Studio/Outputs UI
- Shared platform (importable by both): `lib/ai`, `lib/db`,
  `lib/session`, `lib/api-error`, `lib/rate-limit`, `lib/security`,
  `lib/observability`, `lib/runtime-mode`, `lib/auth*`, `lib/utils`.
- A shared-platform module may not import either product (type-only
  imports excepted). This is enforced, not advisory.
- `node scripts/check-boundaries.mjs` enforces all of the above. It must
  pass. Do not widen its lists to make an import legal — change the
  import.
- Do not add a bounded context, a runtime, a queue, a store or a
  provider layer that duplicates one that exists. If a new one is
  genuinely needed, justify it explicitly before writing it.
- Server-only modules declare `import "server-only"`. Wire contracts
  shared with the browser must not.

## 2. Knowledge

Established and implemented. Detail: `docs/knowledge-semantic-search.md`,
`docs/knowledge-production-e2e.md`.

- Pipeline stages, in order, dispatched by `knowledge_jobs.job_type`:
  `ingest` → `index` → `concepts`. Each stage reads what the previous
  one wrote and re-does none of it.
- Ingestion fetches and extracts once. Extraction produces flattened
  plain text plus metadata from the page's own tags; it invents nothing.
- Chunking is deterministic and content-hash guarded.
- Indexing writes chunks (lexical `tsvector`/GIN) and, when an embedding
  credential exists, pgvector embeddings (HNSW, cosine). **Semantic
  search fails open**: with no credential, lexical still answers.
- Concepts (`knowledge_concepts`, `knowledge_item_concepts`) record what
  an item is about, with provenance (`llm | rule | user`), a confidence,
  and evidence citing real chunk ids. **The model never writes
  directly** — every extraction passes a validation gate first, and a
  concept citing an unknown chunk is dropped.
- Retrieval is hybrid (lexical + semantic, fused with RRF) then
  MMR-reranked. Ask answers only from retrieved context, with verified
  citations; it never answers from model memory.
- Research takes an objective, not a question, and returns a brief.
  Web research and library research are separate and are not merged.
- Discovery (`GET /api/knowledge/:id/related`) is computed on read from
  shared concepts. No stored edges, no graph, no LLM. Its explanation is
  assembled from stored facts so a reader can check it.
- Voice is Web Speech API only, in the browser: dictation into existing
  search, and TTS in the Reader. There is no voice backend and must not
  be one. Voice is an interface over existing capabilities:
  `text/click/voice → intent → existing capability`.
- Never present generated or sample data as the user's own. A surface
  backed by demo data says so; an unanalyzed item says it is unanalyzed
  rather than showing an empty result.

## 3. Persistence

- One PostgreSQL 16 database with pgvector, reached through
  `DATABASE_URL`. No second database, no ORM, no alternative store.
- All SQL is raw and parameterized, in `lib/db/repo.ts` and
  `lib/knowledge/repo.ts`. Never interpolate values into SQL.
- Schema changes are additive, forward-only, numbered SQL files in
  `migrations/`, applied by `pnpm migrate`. Every statement idempotent
  (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Never edit an applied
  migration.
- Timestamps are `BIGINT` epoch milliseconds. Ids are prefixed TEXT.
- Reuse the existing Knowledge object model. Do not introduce a parallel
  representation of a saved item.

## 4. Security

- **Owner scoping is the rule, not tenant scoping.** Every Knowledge
  read and write is predicated on
  `org_id = $ AND created_by IS NOT DISTINCT FROM $`. A colleague in the
  same organization is as unauthorized as a stranger.
- A resource the caller does not own is indistinguishable from one that
  does not exist: same 404, same body. No endpoint may be usable as an
  existence oracle.
- Derived resources (chunks, tags, concepts, related items, jobs)
  inherit the owner predicate. A table without a `created_by` column
  enforces it by joining back to `knowledge_items`.
- Every client-supplied id is authorized before use. Unguessability is
  not authorization.
- Server-side fetches of user-supplied URLs go through
  `lib/security/ssrf-guard.ts` — scheme allowlist plus resolved-address
  checks, not hostname string checks.
- Knowledge responses carry the CSP and header set in
  `lib/knowledge/security-headers.ts`. Embed origins in the CSP must
  match the origins the code actually emits.
- Model output is untrusted input. Validate it against a contract before
  it reaches the database; never let it name a resource it was not
  given.
- Rate limits live in `lib/rate-limit.ts`. Anything that spends money or
  makes an outbound request is limited; read-only derived data is not.
- Secrets: never create or modify `.env.local`, never print a secret,
  never commit one, never invent a credential. Credentials are read at
  call time and must not appear in logs, errors or responses.
- Sessions are JWT with no server-side store; `users.session_version` is
  the revocation mechanism. A password reset bumps it.
- Recorded product decision: **email verification is not a login gate.**
  The token flow is real and delivery goes through `lib/auth-email.ts`,
  whose unconfigured provider reports failure rather than silently
  succeeding. Making verification mandatory would lock out every
  pre-existing account — that change requires an explicit decision.

## 5. AI / agents

- Model providers live in `lib/ai/llm` (Anthropic, Gemini) and
  embeddings in `lib/ai/embeddings.ts`. **Do not write a second HTTP
  client for a provider that already has one.**
- Workforce capabilities are declarations in two registries:
  `lib/agent/tools/registry.ts` and `lib/agent/skills/registry.ts`.
  Adding a capability means adding a definition; the runtime does not
  change.
- Tools satisfy `ToolDefinition`; skills satisfy `SkillDefinition`.
  A tool that needs a credential reports itself unconfigured with the
  real reason rather than faking a result.
- Keyless and keyed tools coexist deliberately (`web-search` alongside
  `tavily-search`). A keyed tool does not replace the keyless default.
- Grounding is enforced in code, not requested in a prompt: a finding
  whose citations do not resolve is dropped, never rendered beside
  sourced ones.
- No autonomous agents, multi-agent orchestration, or agent framework
  beyond what exists.

## 6. Git

- Never force-push. Never rebase work that is already pushed.
- Never rewrite history on a branch you did not create.
- Check the current branch before changing anything.
- Do not commit to or merge into `main` without explicit authorization.
- Do not merge a PR unless asked to.
- Never delete or overwrite existing work to resolve a conflict —
  integrate both sides and say what you did.
- Commits are coherent and self-contained: one change, a message that
  explains why, and a tree that passes the gates.
- Push only when the task authorizes it.

## 7. Deploy

- Local working tree, the remote branch, and what is deployed are three
  different things. Never conflate them.
- **The repository does not record which branch Vercel publishes.**
  `vercel.json` contains crons only. Never assume `main` is the
  production branch — check the Vercel Production Branch setting first.
- Never state that something is live, deployed, or in production without
  having verified it. "Pushed" is not "deployed".
- Server-side configuration (`DATABASE_URL`, `AUTH_SECRET`,
  `CRON_SECRET`, provider keys) is environment state, not repository
  state. Absent configuration degrades visibly; it never fakes success.

## 8. Testing

- Four gates, all required after any change:
  `pnpm typecheck` · `pnpm test` · `pnpm boundaries` · `pnpm build`.
  (`pnpm verify` runs the first three.)
- Tests are `node --test` with `--experimental-strip-types`. **No test
  framework, no test dependency.** Strip-only mode cannot parse
  TypeScript parameter properties — assign fields in the constructor
  body.
- Tests run against a real PostgreSQL. `tests/helpers/register-alias.mjs`
  forces `DATABASE_URL` to a disposable test database; never point the
  suite at a real one.
- No test contacts a real external service. Providers, search APIs and
  OAuth are mocked at a seam. A test must never require a credential.
- Never weaken or delete an existing assertion to make a change pass. If
  a test encodes an assumption the change invalidates, make the
  assertion *more* specific, and say so.
- For anything security- or ranking-relevant, mutation-check it: remove
  the predicate or the guard and confirm a test fails. Coverage alone is
  not evidence.
- Fix the code, not the test, when they disagree — unless the test is
  demonstrably wrong, in which case say that plainly.

## 9. Working protocol

```
AUDIT → PLAN → IMPLEMENT → TEST → VERIFY → REPORT
```

- **AUDIT first.** Read the real state before changing it. Do not act on
  a remembered or reported state.
- Identify and justify any architecturally significant change *before*
  implementing it. If it is significant and was not asked for, raise it
  instead of doing it.
- Implement the smallest change that does the job. No speculative
  abstractions, no new dependency without need, no infrastructure ahead
  of a demonstrated requirement.
- Do not rewrite working code on architectural preference. Do not remove
  functional code without checking dependents and stating the impact.
- **VERIFY** means observing the result, not inferring it — gates run,
  output read, and where it matters, the real behaviour exercised.
- **REPORT** what actually happened: failures with their output, steps
  skipped, and anything unverifiable named as unverified rather than
  converted into a pass.

## 10. Documentation

- `docs/knowledge-semantic-search.md` — retrieval configuration and
  operations.
- `docs/knowledge-production-e2e.md` — what has and has not been run
  against real infrastructure.
- Migration files carry the reasoning for their own schema decisions;
  read the header before changing a table.
- This file holds permanent rules only. Detail belongs in `docs/`, and
  task-specific decisions belong in the task — do not promote either
  here.
- Update `docs/` when a documented behaviour or configuration changes.
  Update this file only when a permanent rule changes.
