# Knowledge semantic search — configuration and operations

What this covers: the retrieval pipeline behind **Ask** (`/knowledge/ai`,
`POST /api/knowledge/ai`) and what has to be true in a deployment for it
to work.

The single most useful thing to know before reading further: **semantic
search fails open.** With no embedding credential the system still
answers — from lexical retrieval alone — so nothing breaks, nothing
errors, and a half-working deployment looks healthy from the outside.
Everything below exists so that state is visible rather than assumed.

---

## Required configuration

| Variable | Required for | Without it |
|---|---|---|
| `DATABASE_URL` | everything | The app fails loudly at startup. No fallback store exists. |
| `ANTHROPIC_API_KEY` | generating the answer | `POST /api/knowledge/ai` returns **503**; the UI says Ask is not configured. It never answers from the model's own memory. |
| `GEMINI_API_KEY` | embeddings | Semantic retrieval is skipped. Lexical still runs. |
| `GEMINI_EMBEDDING_MODEL` | embeddings | Same as above — the key alone is not enough. |

Two variables that are **not** interchangeable and are easy to confuse:

- `GEMINI_MODEL` — text generation, used only when `LLM_PROVIDER=gemini`.
- `GEMINI_EMBEDDING_MODEL` — embeddings for Knowledge, used **regardless**
  of `LLM_PROVIDER`. Knowledge embeds with Gemini even when Anthropic
  generates the answer.

Neither has a default. No model id in this repository is guaranteed
current, so a missing value is treated exactly like a missing
credential rather than silently calling a model that may not exist.

### Choosing an embedding model

The model must support the `outputDimensionality` parameter. The
pipeline requests **768** and refuses any other width before writing to
the database. Google's earlier `models/embedding-001` explicitly does
not support the parameter and will not work.

#### Candidate models

Facts gathered from Google's published documentation. **No model is
chosen here** — `GEMINI_EMBEDDING_MODEL` has no default and picking one
is a deployment decision.

| Model | Embeddings | `outputDimensionality` | Native dim | Can return 768 | Retrieval task types |
|---|---|---|---|---|---|
| `models/embedding-001` | yes | **no** — explicitly rejected | 768 | n/a | limited |
| `text-embedding-004` | yes | yes | 768 | yes | yes |
| `gemini-embedding-001` | yes | yes | 3072 | yes (768 is a recommended truncation) | yes |
| `gemini-embedding-2` (preview) | yes | yes | 3072 | yes (768 is a recommended truncation) | yes |

`models/embedding-001` **cannot be used**: the SDK's own type
documentation states `outputDimensionality` "cannot be set" for it, and
this pipeline always sets it.

The remaining three are all viable. Verify the id is current at deploy
time — model availability moves faster than this document.

#### On normalization — read this before "fixing" it

Google documents that `gemini-embedding-001` returns **unnormalized**
vectors when `outputDimensionality` is set below its native 3072, and
advises normalizing manually. Reports differ on whether
`gemini-embedding-2` does the same.

**It does not affect this pipeline, and no normalization step should be
added.** The index is `vector_cosine_ops` and cosine distance divides by
both magnitudes, so a vector and the same vector scaled are exactly the
same distance from any query. The similarity scores are therefore true
cosine similarities whatever the vector's length, and the relevance
floor means what it says.

This was measured, not assumed: pgvector returns the same distance for a
raw vector, the same vector scaled 7.3×, and its unit-normalized form,
to within float32 storage rounding (~5e-9). The measurement is pinned as
a test in `tests/knowledge/hybrid.test.ts`.

The conclusion is specific to cosine. **Switching the index to
`vector_l2_ops` or `vector_ip_ops` would make normalization mandatory** —
the test asserts the operator class for exactly that reason, and will
fail loudly if it changes.

---

## Database requirements

| | |
|---|---|
| Extension | `pgvector` (`CREATE EXTENSION vector`) |
| Column | `knowledge_chunk_embeddings.embedding vector(768)` |
| Index | `idx_knowledge_chunk_embeddings_hnsw` using `hnsw (embedding vector_cosine_ops)` |
| Constraint | `CHECK (dimensions = vector_dims(embedding))` |

Read-only checks:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

SELECT format_type(atttypid, atttypmod)
  FROM pg_attribute
 WHERE attrelid = 'knowledge_chunk_embeddings'::regclass AND attname = 'embedding';

SELECT indexname FROM pg_indexes
 WHERE tablename = 'knowledge_chunk_embeddings';
```

`CREATE EXTENSION vector` needs a role with sufficient privilege and is
a one-time action. Migration `0008` issues it as
`CREATE EXTENSION IF NOT EXISTS`, so it succeeds on a database where it
is already installed.

**HNSW has a 2000-dimension ceiling** (measured, not recalled). 768 is
far inside it. `halfvec`, which would raise that ceiling, needs pgvector
0.7.0+.

---

## Pipeline

```
save → extract → content_hash → chunk → embed → vector(768)
                                                     │
                       ┌─────────────────────────────┴──────┐
                       │                                    │
                  lexical (GIN)                      semantic (HNSW)
                       └────────────── RRF fusion ──────────┘
                                        │
                              admissibility floor
                                        │
                              grounded answer + citations
```

Chunking and embedding are deliberately separate steps. Chunking is
free, deterministic and always safe to re-run; embedding costs money per
passage and depends on a third party. Keeping them apart means a
provider outage cannot stop a document from becoming lexically
searchable, and re-chunking does not re-bill passages that did not
change.

### Admissibility

Retrieval and evidence are different questions. A passage can be the
nearest thing in the library and still support no claim.

- A **lexical** hit is admitted outright. `plainto_tsquery` ANDs every
  term, so a hit means every word of the question appears in the
  passage — weak as ranking, strong as evidence of being on topic.
- A **semantic-only** hit must clear `KNOWLEDGE_MIN_SEMANTIC_SIMILARITY`
  (default **0.5**, cosine similarity).

That default has **not** been measured against real Gemini vectors. It is
one environment variable in one place precisely so it can be tuned with
production data. Raise it if answers cite passages that merely share a
topic; lower it if refusals fire on questions the library does cover.
`retrieval.chunksRejected` on every answer is the number to watch.

---

## Operational checks

All of the checks below are available at **`GET /api/knowledge/indexing`**,
scoped to the calling user's own library:

```jsonc
{
  "semanticSearch": { "enabled": false, "reason": "provider_not_configured" },
  "embedding": { "provider": "gemini", "model": "(unset)", "dimensions": 768 },
  "backlog": { "total": 4, "neverIndexed": 0, "staleChunks": 0, "missingVectors": 4 },
  "jobs": { "queued": 0, "leased": 0, "failed": 0, "done": 0 }
}
```

It is read-only and safe to poll. `POST` to the same path queues the
outstanding work (see Backfill below). Neither verb reports a
credential — the model id is not a secret and is exactly what is needed
when a backlog will not clear.

`jobs.leased` is jobs claimed and being worked right now. It is not a
status: the schema has three (`queued | done | failed`) and a claim is a
lease on a still-queued row. A flat `queued` with nothing leased means
the tick is not running; a climbing `failed` means it is running and
losing.

**Is semantic search on?** Every search result and every answer also
carries `retrieval.semanticSearch`:

```jsonc
{ "enabled": true }
{ "enabled": false, "reason": "provider_not_configured" }  // deployment task
{ "enabled": false, "reason": "provider_error" }           // incident
{ "enabled": false, "reason": "not_requested" }            // mode: "lexical"
```

The distinction matters: one is fixed by setting two variables, the
other by waiting or paging someone. `describeSemanticSearch()` answers
the configuration half without running a search, which makes it usable
as a health check.

**Is there an embedding backlog?** `countBacklog({ orgId, userId })`
returns items the pipeline has not fully processed, by reason:

| Reason | Meaning |
|---|---|
| `never_indexed` | ready item with no chunks — saved before chunking existed, or its job never ran |
| `stale_chunks` | chunks were built from text that has since changed |
| `missing_vectors` | chunks are current but some have no embedding from the configured model |

After a deploy this should fall to zero and stay there. A number that
stops falling means index jobs are failing — check `knowledge_jobs` for
rows in `failed`.

**Are embeddings being written?**

```sql
SELECT model, dimensions, count(*)
  FROM knowledge_chunk_embeddings
 GROUP BY model, dimensions;
```

More than one `model` is expected during a model change and should
converge. Any `dimensions` other than 768 is impossible through the
application (two independent guards prevent it) and would indicate a
direct write.

**Provider errors** are logged as `knowledge_semantic_unavailable`
(query-time) and `knowledge_embed_chunk_failed` (index-time). Neither
carries a credential; both carry the provider's own message.

---

## Backfill

Items saved before this pipeline existed have no chunks and no vectors.
They are not migrated — a migration runs once, in a transaction, with no
budget for third-party latency or failure, which is the opposite of what
embedding a library needs.

Instead, **`POST /api/knowledge/indexing`** surveys the library and
queues one job per candidate **on the existing queue**. The normal
tick drains them; the route enqueues and returns, it does not run
anything itself. Check `GET` on the same path first — it is the dry
run. It is idempotent by construction: the partial unique
index `uq_knowledge_jobs_item_open` permits one queued job per item, so
running it twice — or from two places at once — adds nothing.

There is deliberately no second queue, no second worker, and no second
definition of "indexed" or "analyzed".

### How to run it

Both calls are session-scoped and act on the caller's own library only;
there is no cross-tenant or global backfill, and no CLI. Signed in as
the owner:

```
GET  /api/knowledge/indexing    # dry run: what is outstanding, by reason
POST /api/knowledge/indexing    # queue the work
```

`POST` is rate-limited (`knowledge_backfill`, 5/min per org) because
each queued job becomes real provider calls. Watch `jobs` in the `GET`
response to see the queue drain; `backlog` should fall to zero and stay
there.

### The four reasons

| Reason | What is missing | Job queued |
|---|---|---|
| `never_indexed` | no chunks at all | `index` |
| `stale_chunks` | chunks built from text that has since changed | `index` |
| `never_analyzed` | chunks exist, but no concepts and no completed concepts job | `concepts` |
| `missing_vectors` | chunks are current, some have no embedding from the configured model | `index` |

An item can be several of these at once and only one job may be open
for it, so the reason is picked in **pipeline order**, not by how much
work each implies: chunks must exist and be current before anything can
read them, understanding comes next, and vectors last. Vectors rank
last deliberately — they are the one stage designed to fail open, so in
a deployment with no embedding credential *every* chunked item reports
`missing_vectors` forever; ranking it higher would make the concepts
backfill unreachable there rather than merely slower. Nothing is lost
by an item that needs two: whichever job runs first completes, and the
next run picks up the other.

### Why `never_analyzed` is two conditions

"No concepts" alone cannot tell three situations apart: nobody ever
looked, we looked and the document is genuinely about nothing nameable,
and we looked and it broke. Selecting on it would re-spend a model call
on the middle group on every run.

A **completed concepts job** is the missing fact — it says we looked,
whatever the answer was. So an item needs analysis when it has no
concepts *and* no concepts job has ever completed for it. A job that
could not reach a provider is recorded `failed`, never `done`, so a
real failure comes back round while an honest empty result does not.

That also means a concepts job blocked by a missing credential fails
**immediately and terminally** rather than retrying: an absent
credential is a deployment state, not a transient fault, and retrying
it `max_attempts` times per item across a library would starve the
queue. The backfill is this stage's retry, and it runs when an operator
asks.

---

## What is not proven yet

Honesty about the limits of what has been verified without credentials:

- The client **asks** for 768 dimensions and **refuses** anything else —
  proven by test. That Gemini **returns** 768 for a given model is not,
  and cannot be, until a real key exists.
- pgvector, `vector(768)` and the HNSW index are verified on local
  PostgreSQL 16 / pgvector 0.6.0. Neon has not been checked.
- End-to-end with real Gemini and real Anthropic has never run.
- No embedding has ever been generated by a real provider. Every vector
  in every test came from a deterministic fake.

Semantic search is not production-ready until those three are closed.
