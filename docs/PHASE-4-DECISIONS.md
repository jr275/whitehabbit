# Phase 4 — Decision Record

Every significant decision made in `docs/PHASE-4-MVP-TECHNICAL-SPEC.md`, in the form:
**DECISION · REASON · ALTERNATIVES CONSIDERED · TRADE-OFF · CONSEQUENCE**

Decisions are numbered `D1…D24`. Where a decision revises or supersedes an earlier phase, that is stated explicitly.

---

## D1 — Six bounded contexts, not nine

**DECISION** Identity · Ingestion · Understanding · Library · Search · Import. The brief's proposed Content, Topics and Collections are **not** separate contexts.

**REASON** None of the three has a lifecycle independent of another context. Content is produced and owned by the ingestion pipeline and has no behaviour of its own. Topics are created by Understanding and read by Library — a read model, not an aggregate. Collections in the MVP (see D21) are a named saved query, which is a Library read model.

**ALTERNATIVES** (a) All nine as specified — three contexts owning one table and no behaviour each; (b) three coarse contexts (Ingestion / Library / Search) — Understanding would be buried inside Ingestion, which hides the one place that calls an LLM and therefore the one place to meter and version.

**TRADE-OFF** Library is the largest context and will need splitting when manual collections and annotations land in weeks 9–16.

**CONSEQUENCE** Six module namespaces under `lib/`. Understanding is the only context permitted to call an LLM, which makes cost, caching and prompt versioning single-sited.

---

## D2 — Entities stored as JSONB, not as tables

**DECISION** `object_intelligence.entities JSONB` instead of Phase 2 §6's `entities` + `object_entities` tables.

**REASON** The understanding call produces entities, but the MVP has no entity pages, no entity filter and no knowledge graph. Two tables plus a canonicalisation resolver would exist to serve nothing.

**ALTERNATIVES** (a) Build the tables now as Phase 2 specified — speculative, and the resolver is real work; (b) drop entities from the schema entirely — wasteful, since they come free in the same call and are needed in Phase 5.

**TRADE-OFF** Entities are not indexed or queryable in the MVP. Promoting them later is a backfill from the JSONB.

**CONSEQUENCE** Two fewer tables. **Revises Phase 2 §6.** The JSONB is the migration source for Phase 5's entity pages.

---

## D3 — One vocabulary: merge tags into topics

**DECISION** A single `topics` table with `object_topics.source ∈ {ai, user}`. No separate `tags` / `object_tags`.

**REASON** Phase 2 §6 specified both, but they are two near-identical vocabularies serving one user-visible concept, requiring two resolvers, two filter UIs and two mental models. One vocabulary with a `source` column delivers auto-topics *and* user labels.

**ALTERNATIVES** (a) Both tables as specified — duplication; (b) tags only, no topics — loses the category grouping that gives shelves their shape.

**TRADE-OFF** A user who wants a free-form label semantically distinct from a topic (e.g. `todo`, `for-the-talk`) has to use a topic for it. Acceptable in the MVP; real tags can be added later if users ask.

**CONSEQUENCE** Two fewer tables. One filter vocabulary across library, search, shelves and smart collections. **Revises Phase 2 §6.**

---

## D4 — No `job_events` table

**DECISION** `ingestion_jobs` rows only. No per-job event stream.

**REASON** Phase 2 §6's `job_events` exists to stream a multi-step agent run to a connected client. A four-stage deterministic pipeline is fully described by its job rows, and the client polls object status rather than subscribing to a stream.

**ALTERNATIVES** (a) Build it as specified — a table written on every stage transition, read by nothing; (b) reuse the existing `execution_events` table — carries worker-domain columns and would need reshaping anyway.

**TRADE-OFF** No fine-grained within-stage timeline. If Ask or Research later needs streamed progress, the table returns then — and by then it will have a consumer.

**CONSEQUENCE** One fewer table, one fewer write per stage. **Revises Phase 2 §6.**

---

## D5 — Keep `ingestion_jobs` even though pg-boss has its own tables

**DECISION** A domain-owned `ingestion_jobs` table alongside pg-boss's internal tables.

**REASON** pg-boss archives and eventually deletes completed jobs, so it cannot answer "what was our extraction failure rate by domain last month" (§19) and cannot provide a durable traceable execution id. It also has no place to hold our idempotency key.

**ALTERNATIVES** (a) Rely on pg-boss tables plus `knowledge_objects.pipeline_status` — loses history and the idempotency constraint; (b) query pg-boss's archive table — an internal schema we do not own and should not couple to.

**TRADE-OFF** One extra insert and one update per stage. Negligible against a network fetch and an LLM call.

**CONSEQUENCE** pg-boss owns queueing and retry; `ingestion_jobs` owns durable stage history and idempotency. `ingestion_jobs.id` is *the* traceable execution id.

---

## D6 — Canonicalise the URL before hashing, with a versioned rule set

**DECISION** A ten-step canonicalisation (§4.4) then `sha256`. `CANONICALIZER_VERSION` recorded on every object.

**REASON** Wallabag hashes the raw URL with SHA-1 and does not canonicalise, so `?utm_source=x` creates a duplicate (Phase 1 §K14). Deduplication is the single most visible correctness property of a save-anything product — a user who saves the same article from a newsletter and from X must get one object.

**ALTERNATIVES** (a) Hash the raw URL — Wallabag's bug; (b) resolve redirects first — cannot, the save must return in <200ms; (c) aggressive normalisation including path params — risks merging genuinely different pages.

**TRADE-OFF** Any future rule change splits identities for URLs saved under the old rules.

**CONSEQUENCE** The version column makes a rule change a deliberate, back-appliable migration rather than a silent identity split. Layer-2 dedupe after redirect resolution (§4.5) catches what canonicalisation cannot.

---

## D7 — Enqueue the job in the same transaction as the object insert

**DECISION** `INSERT knowledge_objects` + `INSERT ingestion_jobs` + `pgboss.send()` in one transaction.

**REASON** It makes "the object exists but no job was created" structurally impossible — the most common failure mode in ingestion systems, and one that produces objects stuck in `pending` forever with no error anywhere.

**ALTERNATIVES** (a) Insert then enqueue — a crash between them strands the object; (b) enqueue then insert — a job can reference a row that does not exist; (c) an outbox table polled by the worker — correct, but a second mechanism for something pg-boss already gives us transactionally, since it lives in the same Postgres.

**TRADE-OFF** Couples the queue to the primary database. Accepted — and it is precisely why pg-boss was chosen over an external queue in Phase 2 §5.

**CONSEQUENCE** The save endpoint is atomic. Combined with the reaper (D10), no object can be silently lost.

---

## D8 — `partial` is a first-class state, and `extracted` is not a state

**DECISION** States: `pending · capturing · extracting · understanding · embedding · ready · partial · failed`. The brief's `EXTRACTED` is dropped; `PARTIAL` is added.

**REASON** An object that is readable but whose AI stage failed is a *success with reduced capability*, not a failure. Without `partial` the UI must either lie or show a permanent error on a perfectly readable article. `EXTRACTED` names a completed action rather than a resting state, which invites ambiguity about whether work is pending.

**ALTERNATIVES** (a) The brief's list verbatim — no way to express "readable, no summary"; (b) a boolean `ai_failed` flag alongside `ready` — two sources of truth for one concept.

**TRADE-OFF** One more state for the UI to render.

**CONSEQUENCE** Every AI stage becomes optional (§5.3): its failure degrades capability, never availability. The card's four visual states follow directly.

---

## D9 — Compare-and-swap on every stage entry

**DECISION** Each stage begins with `UPDATE … SET pipeline_status=$next WHERE id=$1 AND pipeline_status=$expected RETURNING id`. Zero rows returned → exit without doing the work.

**REASON** It is the strongest of the four duplicate-processing defences because it is atomic in the database and does not depend on the queue behaving correctly. Redelivery, a duplicate enqueue and two workers racing all resolve to exactly one execution.

**ALTERNATIVES** (a) pg-boss singleton keys alone — protects the queue, not the database; (b) advisory locks — held per connection, lost on crash; (c) an optimistic version column — equivalent, but adds a column for what the status already expresses.

**TRADE-OFF** Every stage carries a guarded update as its first statement.

**CONSEQUENCE** Layered with singleton keys, the unique idempotency key and content-hash short-circuits (§6.3). Duplicate LLM billing becomes near-impossible outside the D11 window.

---

## D10 — A reaper job, running every five minutes

**DECISION** A scheduled job re-enqueues objects in a transient state with no active pg-boss job and `updated_at` older than 15 minutes; marks `failed` after three reaps.

**REASON** Every other mechanism assumes the message survives. A lost message — worker OOM after claiming, a queue bug, a deploy at the wrong moment — leaves an object spinning forever with no error and no alert. This is the difference between a pipeline that self-heals and one that needs a human to notice.

**ALTERNATIVES** (a) Rely on pg-boss's visibility timeout — covers claimed-then-crashed, not enqueue-then-lost; (b) a manual admin retry — requires someone to notice; (c) client-side timeout and retry — pushes a server problem to the browser.

**TRADE-OFF** A background job that usually does nothing, plus care that it never fights a genuinely long-running job (hence 15 minutes, well above every stage timeout).

**CONSEQUENCE** Listed as non-cuttable scope in §24.5. `objects_reaped` is a monitored metric — a rising count means something upstream is broken.

---

## D11 — Accept the double-billing window

**DECISION** A crash after the LLM call returns but before its DB write commits will bill twice on redelivery. Accepted, minimised, and measured.

**REASON** Eliminating it requires either a distributed transaction with the provider (impossible) or writing an intent record before the call and reconciling after (a second write on every call, plus a reconciliation path, to close a window measured in milliseconds).

**ALTERNATIVES** (a) Pre-write an intent row — real cost on every call for a rare event; (b) a provider-side idempotency key — not uniformly available and it does not help if we never see the response.

**TRADE-OFF** A small, rare, real financial loss.

**CONSEQUENCE** The call and its write are the last two operations in the stage with nothing between them, and the write is one transaction. `attempt > 1 AND stage='understand'` is monitored (§19.2) so the rate is known rather than assumed.

---

## D12 — The sidecar never fetches; Node fetches and passes HTML

**DECISION** `POST /extract` always receives pre-fetched `html`. The PHP container has **no outbound network access**.

**REASON** It makes the sidecar structurally incapable of being an SSRF proxy, even if compromised. All URL validation stays in one place, in the language where the guard already exists and is tested.

**ALTERNATIVES** (a) Let graby fetch, as Wallabag does — imports exactly the vulnerability Phase 1 rated critical; (b) fetch in PHP behind a port of the guard — two implementations of the most security-sensitive code in the product.

**TRADE-OFF** graby's own HTTP-level features (site-specific headers, cookie handling for login-walled sites) are unavailable. Not needed in the MVP; when they are, the site-config directives can be read and applied by the Node fetcher.

**CONSEQUENCE** The sidecar is a pure function from bytes to structure, with no database, no secrets and no egress. **Implements Phase 2 §3.**

---

## D13 — Node readability first; the sidecar is a week-3 upgrade

**DECISION** Week 2 ships extraction on a Node readability implementation. The graby sidecar lands in week 3 as tier 1 behind the existing ladder.

**REASON** Week 1–2 sits on the critical path and already contains retiring a product, turning on type checking, a new schema, a queue and a worker. Adding a second new deployment target in the same window is the highest-probability cause of a week-1 slip, and a slip there slips everything.

**ALTERNATIVES** (a) Sidecar in week 1 as Phase 2 implies — denser critical path; (b) Node-only for the whole MVP — discards the asset Phase 1 identified as irreplaceable.

**TRADE-OFF** ⚠ **A real organizational risk**: once Node-only works acceptably, the pressure to never finish the sidecar is genuine, and the loss would be invisible.

**CONSEQUENCE** `siteConfigMatched` rate is a tracked metric with a target from week 3 (§7.6, §19.2), so the gap is visible rather than comfortable.

---

## D14 — One LLM call produces summary, topics, entities and key ideas

**DECISION** A single structured call. Not four services, not four calls.

**REASON** All four read the same text once. Four calls would cost roughly 4× for no quality gain. It is also a **service, not an agent** — fixed input, fixed output shape, zero tool calls — which is testable against fixtures and, critically, gives an injected instruction nothing to hijack (§21.3).

**ALTERNATIVES** (a) Separate calls per concern — 4× cost, four failure modes, four prompts to version; (b) an agent with tools — nondeterministic, expensive, and it opens the injection surface the MVP currently does not have.

**TRADE-OFF** One prompt does several jobs, so improving one field means re-validating all of them, and a schema change re-runs everything.

**CONSEQUENCE** `PROMPT_VERSION` is part of the idempotency key, so a deliberate bump re-runs the library and an accidental prefix change does not. **Implements Phase 2 §11 and Phase 3 §18.**

---

## D15 — `claude-opus-5`, structured outputs, cache-ordered prompt

**DECISION** Default model `claude-opus-5` with adaptive thinking at `effort: "medium"`; response shape enforced by `output_config.format`; request ordered frozen-system → workspace-vocabulary → article, with the cache breakpoint after the system block.

**REASON** The understanding stage's output quality *is* the product's quality ceiling, and a weak extraction is not recoverable later without re-billing the whole library. Its 1M context removes the chunk-and-merge stage entirely. Structured outputs remove `unparseable_output` as a failure class rather than retrying around it. The prompt ordering exists because caching is a prefix match — anything volatile in the prefix silently costs ~10× more.

**ALTERNATIVES** (a) A cheaper model — a real option, but it is a decision to make with measured data from the fixture corpus, not an assumption to bake in now; (b) prompt for JSON and parse defensively — reintroduces a failure class the platform can eliminate; (c) put the workspace vocabulary in the system block — would invalidate the cache on every workspace.

**TRADE-OFF** Highest per-call cost of the available options.

**CONSEQUENCE** Cost is managed by the levers in order: caching (verified via `cache_read_input_tokens` as a week-3 acceptance check), the Batch API for imports at 50%, `effort`, truncation, and idempotency. Model choice is the *last* lever and is left to measurement.

---

## D16 — Pass the workspace's existing topic vocabulary in the prompt

**DECISION** The top 60 existing topic labels by `object_count` are included after the cache breakpoint, with an instruction to reuse them where they fit.

**REASON** This is the single most important quality decision for the MVP's wow moment. Without it, labels fragment into "AI Agents" / "AI agents" / "Agentic AI" / "Agents", and shelves — the feature the whole MVP is organised around — look broken.

**ALTERNATIVES** (a) Free-form topics with post-hoc clustering — the Phase 8 approach; unstable at low volume and it reshuffles as the library grows; (b) a fixed global taxonomy — rigid, and it would not reflect *the user's* vocabulary, which is what makes shelves feel personal; (c) resolver-only, no prompt hint — catches near-duplicates but not paraphrases.

**TRADE-OFF** Prompt size grows with the vocabulary; it sits after the breakpoint so the frozen prefix still caches.

**CONSEQUENCE** Paired with the `TopicResolver` (exact → trigram → create, ≤2 new per object). DoD #6 asserts a 3,000-item import yields <300 topics.

---

## D17 — `vector(1536)`, chunk-level, with `tldr` as chunk 0

**DECISION** 1536 dimensions; embeddings on chunks, not documents; the `tldr` + title embedded as ordinal 0.

**REASON** Two hard constraints bound the dimension: **pgvector's HNSW index supports at most 2000 dimensions on the `vector` type**, ruling out 3072-dim models without `halfvec`; and C9 is open, so there is no golden set to measure against yet. Chunk-level is required for precision and for span citations later. Chunk 0 exists because short conceptual queries often match a document's gist rather than any single body paragraph.

**ALTERNATIVES** (a) 3072 with `halfvec` — extra complexity for unmeasured benefit; (b) document-level embeddings — simpler, materially worse retrieval, and it forecloses citations; (c) delay the decision until the golden set exists — breaks the 8-week plan.

**TRADE-OFF** ⚠ **We are fixing a column type before having the evidence to justify it**, and saying so rather than implying otherwise.

**CONSEQUENCE** `embedding_model` on every chunk row makes a future change a resumable backfill. The golden set is a week-6 deliverable, and 1024 remains a strictly cheaper migration if measurement favours it.

---

## D18 — No `SearchProvider` or `StorageProvider` abstraction in the MVP

**DECISION** Search is written directly against Postgres. Storage is written directly against the S3-compatible SDK. Neither gets an interface yet.

**REASON** An interface with one implementation is a guess about the second one. Phase 2 §14 called for a `SearchProvider` seam — correct for the target architecture, premature at eight weeks. The migration triggers are documented and measurable; extract the interface when the second implementation is actually being written, informed by what it needs.

**ALTERNATIVES** (a) Build both seams now as Phase 2 specified — abstraction cost with no second implementation to validate it; (b) never abstract — would be wrong at scale.

**TRADE-OFF** Search queries are Postgres-specific and will need refactoring if a vector store is adopted. Bounded: the queries live in one repository module.

**CONSEQUENCE** **Consciously defers Phase 2 §14's seam.** `EmbeddingProvider` and `LlmProvider` *are* built — because embedding models turn over every 12–24 months and the LLM seam already exists.

---

## D19 — A fixed category enum instead of topic clustering

**DECISION** The model classifies each topic into one of ten fixed categories. `topics.parent_id` exists but is NULL in the MVP. No clustering.

**REASON** The brief asks for a two-level shape (`AI → Agents / Models`). Real hierarchy needs topic embeddings plus an LLM naming pass — unstable at low volume, and it reshuffles as the library grows, which reads as broken. A closed category list costs zero extra calls (it is a field in the existing response), is near-deterministic, and produces exactly the requested shape.

**ALTERNATIVES** (a) Embedding clustering + LLM naming — the Phase 8 rich version; unstable and high-risk in week 5; (b) flat topics only — delivers the wow but not the requested shape; (c) a fixed taxonomy for topics too — rigid, and it would stop reflecting the user's own vocabulary.

**TRADE-OFF** Categories are ours, not the user's, and some topics will sit awkwardly in `other`.

**CONSEQUENCE** The emotional beat lives at the topic level, where the vocabulary is genuinely the user's. `parent_id` is reserved for Phase 8 real hierarchy. **Refines Phase 3 §12 into something buildable in week 5.**

---

## D20 — Shelves render only above 50 objects and 3 items per shelf

**DECISION** Topic shelves appear once the library has ≥50 objects; individual shelves need ≥3 items.

**REASON** A shelf containing one item looks like a bug, and a library of twelve articles organised into nine shelves looks worse than the same twelve in a grid. The wow moment depends on the shelves looking *inevitable*.

**ALTERNATIVES** (a) Always show shelves — bad first impression for organic users; (b) a user toggle — a configuration decision users should not have to make.

**TRADE-OFF** Organic users (no import) do not see the #1 wow moment for their first ~50 saves. This is a known and accepted asymmetry, and it is a large part of why import is non-cuttable.

**CONSEQUENCE** A mode switch, not an empty state (§16.6). Below-threshold topics are still assigned, filterable and searchable — they just do not get a shelf.

---

## D21 — Smart collections only; manual collections deferred

**DECISION** ⚠ Conditional on **C4**. Recommended: ship "Save this view" smart collections; defer manual curation to weeks 13–16.

**REASON** Phase 3 §5 makes Collections one of three primary destinations while Phase 3 §18 ships no collections at all — the MVP would ship a nav item leading nowhere. Smart collections are ~2 days (the `rule` is exactly the query shape the library API already accepts) and they make the navigation honest.

**ALTERNATIVES** (a) Drop Collections from the nav — two destinations plus the palette, also coherent; (b) ship the nav item disabled — rejected outright: Phase 3 §6's "never appears" list forbids exactly this kind of dead end.

**TRADE-OFF** Users cannot hand-curate a reading list in the MVP.

**CONSEQUENCE** One filter vocabulary across library, search and collections. `collection_objects` is specified but unused until manual collections land. **Resolves a contradiction internal to Phase 3.**

---

## D22 — Import uploads go directly to R2, never through a function

**DECISION** Presigned PUT to object storage; the API receives only a file key.

**REASON** A 50 MB CSV through a serverless function is a memory and timeout problem with no good solution. This is the decision that makes large imports possible at all.

**ALTERNATIVES** (a) Multipart upload to a route handler — bounded by function memory and the 60s ceiling; (b) chunked client-side upload with server reassembly — reimplements what presigned URLs give for free.

**TRADE-OFF** The client needs a two-step flow, and presigned URLs must be tightly scoped and short-lived.

**CONSEQUENCE** The file never touches Vercel. Parsing happens in the worker, which streams it rather than loading it, and inserts in batches of 500 to bound memory and transaction size.

---

## D23 — Import must not starve live saves: priority, caps, separate queues, batch API

**DECISION** Import-sourced jobs are enqueued at LOW priority on separate queue names, capped at 5 concurrent per workspace, with understanding routed through the Batch API.

**REASON** The onboarding flow is *import then immediately save something live*. If a 3,000-item import makes the next live save take four minutes, the product feels broken at exactly the moment the user is deciding whether to keep it.

**ALTERNATIVES** (a) One queue, FIFO — a large import blocks everyone; (b) a global import concurrency cap — one user's import still blocks another's; (c) a separate worker fleet for imports — real isolation, but a second deployment for a problem priority and caps already solve.

**TRADE-OFF** Imports complete more slowly (20–60 min for 3,000 items) than they otherwise could.

**CONSEQUENCE** Separate queue names make "is saving slow" and "is import slow" separately answerable. **Live-save p95 during an active import is a Definition-of-Done criterion**, not just a metric.

---

## D24 — RLS at week 7, not week 1

**DECISION** Row-Level Security is migration 0013, applied in week 7, before launch.

**REASON** RLS is the *backstop*; the primary control is the repository layer's required `AccessScope` plus the query predicate. Enabling RLS in week 1 while the schema is still moving generates policy churn and confusing failures during exactly the period when the schema changes most.

**ALTERNATIVES** (a) RLS in migration 0004 as Phase 2 §9 implies — correct in principle, and it would slow the weeks where the schema is least stable; (b) skip RLS entirely — leaves a repo-layer bug sufficient for a cross-tenant leak.

**TRADE-OFF** ⚠ Weeks 1–6 rely on the repository layer alone. This is only acceptable because **the tenant-isolation test suite is Priority 1** and runs from week 1, and because a synthetic cross-tenant canary is in place.

**CONSEQUENCE** A deliberate sequencing choice, not a de-prioritisation. RLS ships before launch and is a launch gate. **Note it is coupled to R1**: while `typescript.ignoreBuildErrors: true` remains, the compiler-level layer is also inactive — which is why turning it off is a week-1 task.

---

## Decisions deferred to a human

These are **not** decided here. They are recorded in §1.2 and §27.3 of the specification.

| Ref | Question | Needed by |
|---|---|---|
| **C12** | Is the agent-workforce product being retired? | **Before week 1 — blocking** |
| **C13** | Team size (the 8-week plan assumes 3 engineers) | **Before committing to the date — blocking** |
| C3 | Third import format: Raindrop or Wallabag? | Week 4 |
| C5 | Auth: keep the existing Credentials provider and add Google? *(recommended)* | Week 1 |
| C4 | Smart collections in the MVP? *(D21 recommends yes)* | Week 6 |
| C9 | Embedding provider *(D17 fixes the dimension; the provider is open)* | Week 6 |
| C7 | Pull Ask-This-Article into week 8 if week 6 lands on time? | Week 7 |
| — | Acceptable AI cost per saved object | Week 4 |
| — | Self-hosting requirement · data retention policy · brand direction for v0 · keep any existing data? | Various |
