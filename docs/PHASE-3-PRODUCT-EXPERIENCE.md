# Phase 3 — Product Experience Architecture
## AI-Powered Personal Knowledge Library

**Status:** Product specification only. No code, no components, no database, no migrations, no APIs, no frontend files.
**Date:** 2026-09-01
**Builds on:** `docs/PHASE-1-ARCHITECTURE-AUDIT.md`, `docs/PHASE-2-TARGET-ARCHITECTURE.md`

---

# 0. WHAT CHANGED FROM PHASE 2

Two revisions, both flagged where they occur, because thinking about the *product* surfaced things that thinking about the *architecture* did not:

1. **The first wow moment is Topic Shelves, not semantic search** — for the import path, which is most users. Semantic search remains the wow moment for organic users. Section 3 explains why, and section 18 moves a cheap version of shelves into the 8-week build. This is a refinement of Phase 2 §27, not a contradiction: Phase 2 was reasoning about the organic path only.
2. **The 8-week MVP is smaller than Phase 2's MVP.** Phase 2 defined the smallest *valuable* product. Phase 3 §18 defines what fits in eight weeks, which is less. Ask-This-Article and highlights move to weeks 9–12.

---

# 1. PRODUCT MISSION AND POSITIONING

## The feeling we are engineering for

> *"I finally have a brain for everything I discover online."*

That sentence contains three promises, and the product fails if it breaks any one of them:

| Promise | What it obligates us to |
|---|---|
| **"a brain"** | It *understands*, not just stores. Every saved thing must come back richer than it went in. |
| **"everything"** | Nothing is too small, too weird, or too much work to save. Friction at capture kills the whole product. |
| **"I discover"** | It respects that the user's curiosity is theirs. It organises *their* interests, not a generic taxonomy. |

## What this is not

| Not a… | Because that category's core promise is… | Ours is… |
|---|---|---|
| Bookmark manager | *"I'll remember where it is"* | *"I'll remember what it said"* |
| Read-later app | *"You'll read this eventually"* (you won't) | *"You don't have to read it to benefit from it"* |
| Note-taking app | *"Write down what you think"* | *"We capture what you encountered; you add what you think"* |
| Browser extension | *"A button"* | The extension is a doorway, not the house |

## The positioning sentence

**Every other product in this space makes you do the work of remembering. This one does it for you.**

Pocket asks you to organise. Notion asks you to structure. Readwise asks you to review. Obsidian asks you to link. Every one of them is a system that gets better the more effort you put in — which means every one of them decays the moment life gets busy.

**The core product bet: a knowledge system whose value does not depend on user discipline.** You save. It understands. It organises. It connects. When you need something, it is there — and you never filed it.

That is the thing nobody has shipped well, and it is the only reason to build another product in a crowded category.

## The three-line pitch

> Save anything from the internet with one click.
> It gets read, summarised, organised and connected — automatically.
> Then ask your library anything, and get an answer with receipts.

---

# 2. USER PERSONAS

Eight personas, each with the job they are hiring this product to do. They are **not equally valuable**, and section 2.9 ranks them — deciding who we are *not* building for in year one is as important as deciding who we are.

---

## 2.1 The Founder — "Maya"

*Seed-stage B2B SaaS. Reads to make decisions, not to learn.*

| | |
|---|---|
| **Job to be done** | *"Help me not miss the thing that changes my strategy."* |
| **Motivations** | Pattern-matching across a market. Competitive awareness. Sounding informed with investors and customers. Reads to *act*, and the window is days, not months. |
| **Frustrations** | 60 open tabs and no time. Saves things and never returns. Knows she read something relevant to today's decision but cannot find it. Newsletters pile up unread and guilt accumulates. |
| **Usage patterns** | Bursty. Saves 15 things on Sunday, reads nothing for four days, then needs one of them urgently before a board call. **Retrieval-heavy, reading-light.** Mobile capture, desktop retrieval. |
| **Content types** | Newsletters (Lenny's, Stratechery-class), competitor blogs, funding announcements, X threads, podcasts, investor memos, pricing pages |
| **Retention drivers** | **Search that works under pressure.** The Monday brief. Being able to say "what did I save about usage-based pricing" and get it. Audio on the commute. |
| **Kills retention** | A search that returns nothing when she knows she saved it. That single failure ends the relationship. |
| **Pays?** | **Yes, immediately, and doesn't check the price.** Time is the constraint, not money. |

---

## 2.2 The Product Manager — "Devansh"

*Series B, owns a platform area. Reads to build arguments.*

| | |
|---|---|
| **Job to be done** | *"Help me build a case my team and my VP will accept."* |
| **Motivations** | Competitive teardowns. Design pattern references. Evidence for a roadmap fight. Wants to *cite* things, not just recall them. |
| **Frustrations** | Research scattered across Notion, Slack saves, Figma comments and 40 bookmarks. Rebuilds the same competitive analysis every quarter because last quarter's is unfindable. |
| **Usage patterns** | **Project-shaped.** Intense saving for two weeks around a spec, then dormant. Returns to old clusters when the topic resurfaces. Heavy screenshot and image saver. |
| **Content types** | Competitor product pages, changelogs, design systems, research reports, HN threads, Reddit, screenshots, PDFs |
| **Retention drivers** | **Collections that survive the gap between projects.** Ask-my-library for "what did we learn about onboarding". Sharing a collection with the team. |
| **Kills retention** | Having to manually organise. He already has Notion for that and resents a second filing job. |
| **Pays?** | Yes — and is the **wedge into TEAM**, because his output is inherently shared. |

---

## 2.3 The Researcher — "Dr. Ines"

*Academic or industry research. Reads deeply and for years.*

| | |
|---|---|
| **Job to be done** | *"Help me hold a literature in my head, and notice when sources disagree."* |
| **Motivations** | Comprehensive coverage. Citation integrity. Tracking how a field's consensus moves. **Contradiction is signal, not noise** — the thing everyone else treats as an edge case is her core job. |
| **Frustrations** | Zotero is a filing cabinet, not a thinking tool. PDFs are unsearchable in practice. Cannot ask "who disagrees with X and on what grounds" without rereading everything. |
| **Usage patterns** | **Highest volume, longest horizon, deepest per item.** Thousands of items over years. Heavy highlighter and annotator. Returns to items from 18 months ago routinely. |
| **Content types** | **PDFs and preprints above all**, journal articles, conference talks, datasets, long-form |
| **Retention drivers** | **Contradiction detection** — genuinely unique, and the single feature she cannot get elsewhere. Highlights that survive. Citation export. Semantic search across a decade. |
| **Kills retention** | Weak PDF handling. Lost or drifting highlights. Any hallucinated citation — one is disqualifying, permanently. |
| **Pays?** | Yes, personally, if PDFs are excellent. Institutional budgets are slow but real. |

---

## 2.4 The Student — "Tomas"

*Postgraduate. Reads to pass, then to know.*

| | |
|---|---|
| **Job to be done** | *"Help me understand this faster than reading all of it."* |
| **Motivations** | Deadline compression. Comprehension of hard material. Turning reading into revision. |
| **Frustrations** | Volume vs time. Dense papers he can't parse alone. Everything good is behind a subscription he can't afford. |
| **Usage patterns** | **Extremely bursty and deadline-shaped.** Nothing for three weeks, then 40 saves in two days. Heavy summary and ask-AI usage; light organising. Mobile-first more than any other persona. |
| **Content types** | Lecture PDFs, papers, YouTube lectures, Wikipedia, textbook chapters |
| **Retention drivers** | Summaries and Ask-AI during crunch. Audio for commuting. |
| **Kills retention** | Any paywall on the AI features he came for. |
| **Pays?** | **Mostly no.** High usage, low willingness, high support cost, high AI cost per user. |
| **Strategic value** | **Distribution and habit formation, not revenue.** Students become knowledge workers with expense accounts in three years. A generous free tier here is a marketing cost, and it should be understood as one — not mistaken for a market. |

---

## 2.5 The Knowledge Worker — "Priya"

*Consultant / analyst / strategist. Reads as the job.*

| | |
|---|---|
| **Job to be done** | *"Help me turn what I've read into something I can deliver."* |
| **Motivations** | Client deliverables. Being the person who *knows things*. Reusing past work instead of redoing it. |
| **Frustrations** | Knowledge dies in old decks and folders. Re-researches things she already researched. Cannot find the stat she cited eight months ago. |
| **Usage patterns** | **The most consistent daily user of all eight.** Steady saving, steady retrieval, project-clustered. The persona whose usage curve is flattest and most durable. |
| **Content types** | Industry reports, analyst notes, news, PDFs, newsletters, webinars |
| **Retention drivers** | Search reliability. **Content creation from the library** — the "turn this into a briefing" feature. Weekly intelligence. |
| **Kills retention** | Slow retrieval. She is billing by the hour; ten seconds of latency is a real cost. |
| **Pays?** | **Yes, and is the highest-LTV individual persona.** Often expensable without approval. |

---

## 2.6 The Journalist — "Sam"

*Investigative or beat reporter. Reads to find the story.*

| | |
|---|---|
| **Job to be done** | *"Help me see the connection nobody else has seen yet."* |
| **Motivations** | Source tracking. Timeline construction. Spotting the inconsistency between what someone said in 2023 and what they said last week. |
| **Frustrations** | Hundreds of sources per story with no through-line. Cannot reconstruct who said what when. Fear of losing a source to link rot. |
| **Usage patterns** | Story-shaped and intense. Heavy entity tracking. **The only persona for whom the knowledge graph is a primary feature rather than a nicety.** |
| **Content types** | News, filings, PDFs, X posts, transcripts, court documents, archived pages |
| **Retention drivers** | **Entity tracking** ("everything about this company"). **Contradiction detection.** Raw-HTML archival — link rot is an existential problem in this job. |
| **Kills retention** | Any doubt about source integrity. |
| **Pays?** | Sometimes personally, often institutionally. **Small market, disproportionate influence** — journalists write about tools they love. |

---

## 2.7 The AI Builder — "Kenji"

*Engineer or founder building with LLMs. Reads to keep up in a field that moves weekly.*

| | |
|---|---|
| **Job to be done** | *"Help me keep up with a field that changes faster than I can read."* |
| **Motivations** | Papers, repos, model releases, technique threads. Terrified of missing the thing that obsoletes his approach. Extremely high save rate. |
| **Frustrations** | Firehose. Saves 30 things a week and reads five. Knows the answer to today's problem is in something he saved in March. **Feels perpetually behind.** |
| **Usage patterns** | **Highest save volume of all personas.** Save-heavy, read-light, retrieval-spiky. Power user of search and Ask-AI. Will find every rough edge and tell you. |
| **Content types** | arXiv papers, GitHub repos, X threads, technical blogs, docs, YouTube talks, HN |
| **Retention drivers** | **Semantic search** — his queries are conceptual, never keyword-shaped. Ask-my-library. Related content. The daily brief that says *"three things dropped in your topics."* |
| **Kills retention** | Bad arXiv/PDF handling. Bad X-thread capture. Slow saves. |
| **Pays?** | **Yes, and evangelises.** Also the harshest critic and the loudest one. |

---

## 2.8 The Executive — "Robert"

*VP / C-suite. Reads to stay oriented, not informed.*

| | |
|---|---|
| **Job to be done** | *"Tell me what I need to know without making me read."* |
| **Motivations** | Signal over volume. Sounding current in rooms where being uninformed is expensive. Genuinely has no time. |
| **Frustrations** | Everything is too long. Delegates reading and gets inconsistent summaries. Guilt about the unread pile. |
| **Usage patterns** | **Lowest save volume, highest per-item value.** Often saves via forwarding an email or a chief-of-staff's link. Consumes summaries and audio; **almost never opens the full article.** |
| **Content types** | Newsletters, analyst reports, forwarded links, long-form |
| **Retention drivers** | **The daily brief and audio.** He may never open the library UI in a given week — the product reaches *him*. |
| **Kills retention** | Anything that requires configuration or filing. Any UI complexity at all. |
| **Pays?** | Yes, at the highest tier, without negotiating — **but only if the brief is genuinely good.** A mediocre brief is instantly cancelled. |
| **Design implication** | **He is the strongest argument for push surfaces (email brief, audio) over pull surfaces.** A product that only exists when you open it will never retain him. |

---

## 2.9 Persona ranking — who we build for first

Scored 1–5 on the four things that actually determine whether a persona should shape v1.

| Persona | Volume | Pain | Willingness to pay | Evangelism | **Priority** |
|---|:-:|:-:|:-:|:-:|---|
| **AI Builder** | 5 | 5 | 4 | **5** | **BEACHHEAD** |
| **Knowledge Worker** | 4 | 5 | **5** | 3 | **BEACHHEAD** |
| **Researcher** | **5** | 5 | 4 | 3 | **PRIMARY** (needs PDFs — Phase 6) |
| **Founder** | 3 | 5 | **5** | 4 | **PRIMARY** |
| **Product Manager** | 3 | 4 | 4 | 3 | Secondary — TEAM wedge |
| **Journalist** | 4 | 5 | 3 | **5** | Secondary — influence >> revenue |
| **Executive** | 1 | 4 | **5** | 2 | Secondary — brief/audio dependent |
| **Student** | 4 | 4 | **1** | 3 | **Free tier only** |

### The decision

> **Build v1 for the AI Builder and the Knowledge Worker.**

**Why these two:** they are the only personas with *both* high save volume and high retrieval frequency — which means they exercise the whole loop, generate the data the product needs to be good, and feel the pain of every rough edge immediately. The AI Builder brings distribution (this audience talks publicly about tools); the Knowledge Worker brings revenue durability (highest LTV, expensable, flattest usage curve). They also want the same v1: fast capture, excellent extraction, semantic search, summaries.

**Why not the Researcher first**, despite the highest volume: she needs PDF excellence, and PDFs are a Phase 6 adapter. Shipping to her before PDFs work would burn the persona with the longest lifetime value and the least tolerance for a broken first impression.

**Why not the Executive first**, despite the highest willingness to pay: he needs the daily brief, which needs a populated library and weeks of signal. He is a Phase 8 persona, and trying to serve him in v1 means shipping a thin brief that gets cancelled.

**Why the Student is a free tier, not a market:** highest AI cost per user, lowest willingness to pay, highest support load. He is a marketing investment with a three-year payback, and pricing should treat him as exactly that.

---

# 3. THE WOW MOMENT

## The scoring criteria

A wow moment must clear four bars. Most candidate features clear two.

| Criterion | Why it disqualifies |
|---|---|
| **Time to reach** | A moment in week three is not a first impression. Most users decide in session one. |
| **Impossibility elsewhere** | If Raindrop or ChatGPT can do it, it is a feature, not a moment. |
| **Legibility** | The user must *see* that something remarkable happened, without being told. |
| **Reliability** | A wow that works 70% of the time is a disappointment engine. It must be near-deterministic. |
| **Effort required** | A moment the user has to work for is not a moment. Passive beats active. |

## The ranking

| # | Candidate | Time to reach | Impossible elsewhere | Legible | Reliable | Effort | **Verdict** |
|---|---|---|---|---|---|---|---|
| **1** | **Auto Collections / Topic Shelves** | **~90s (import)** | **Yes** | **Very** | **Very** | **Zero** | **THE FIRST WOW** |
| **2** | **Semantic Search** | Day 1–14 | **Yes** | Medium | High | Active | **THE SECOND WOW** — and the retention one |
| 3 | Ask My Library | Week 2+ | Partly | Very | **Medium** | Active | The *depth* moment. Highest ceiling, highest risk. |
| 4 | AI Summary | ~15s | **No** | High | High | Zero | Table stakes. Necessary, not sufficient. |
| 5 | Daily Brief | Day 2–7 | Partly | High | Medium | Zero | A **retention** mechanic, not a wow. |
| 6 | Recommendations | Month 1+ | No | Medium | Low | Zero | Needs signal history. Nobody is wowed by a related-items list. |
| 7 | Knowledge Graph | Week 2+ | Yes | **Low** | Medium | Active | Impressive in a screenshot, rarely used twice. |

## #1 — Auto Collections / Topic Shelves

**The moment:** Maya connects Pocket. 2,847 links import. Ninety seconds later her library is not a list — it is *shelves*: **Pricing Strategy (94)**, **AI Agents (212)**, **Hiring (67)**, **Climate Tech (41)**. Topics she never named, that are unmistakably hers.

**Why it wins on every criterion:**
- **Time:** it is the first screen after import. Not session one — *minute three of session one*.
- **Impossibility:** Pocket had tags nobody used. Raindrop has folders you build. Notion has a database you design. **Nobody organises your existing pile for you.**
- **Legibility:** it is *visual*. The user does not have to formulate a query or know what to look for. The magic arrives at them.
- **Reliability:** topic labels come from the extraction stage that already ran on every object. Clustering by label with a count is close to deterministic. There is no query to phrase badly.
- **Effort:** **zero.** The user did one thing — connected Pocket — and got a self-organised library. This is the criterion that decides the ranking.

**The emotional beat:** *"It read three thousand things I forgot I saved, and it understood what I care about."* That is the closest a first session gets to the mission statement.

> ### REVISION FROM PHASE 2 §27
> Phase 2 put semantic search first. That was correct **for the organic path** and wrong for the import path, which will be most users because import is a MUST-HAVE. Semantic search requires the user to *think of a good query* — and a large fraction will type a keyword, get a plausible keyword result, and never notice anything extraordinary happened. Topic Shelves requires nothing. **Passive beats active for a first impression**, every time.
>
> **Product consequence:** a cheap version of shelves must be in the 8-week build (§18). It nearly is already — topic labels are produced by the understanding stage the MVP already runs, so "shelves" is grouping and counting, not a new capability. The expensive version (LLM-named semantic clusters that split *AI Agents* into *Agent Memory* and *Tool Use*) stays in Phase 8.

## #2 — Semantic Search

**The moment:** Kenji types *"why do retrieval systems fail in production"* and gets the post he saved in March that never uses the words "retrieval", "fail" or "production" — it is titled *"Lessons from six months of RAG."*

Ranked second only because it demands an active, well-formed query. But it is **the more important of the two**, because it is the moment that recurs. Shelves wow you once; search wows you every time it saves you from a dead end, and it is the direct proof of the retention hypothesis. **Shelves acquire; search retains.**

## #3 — Ask My Library

Highest ceiling — *"Summarise everything I've saved about agent memory and tell me where sources disagree"* is the single most impressive thing this product will ever do. Ranked third on **reliability**: one confidently wrong answer across 3,000 documents costs trust permanently, and trust is the only asset. It ships when citations are provably solid, not before (§10).

## #4 — AI Summary: necessary, not sufficient

Every reader app has one. It earns a nod, not a switch. **We ship it because its absence would be conspicuous**, not because it wins anyone. Its real job is *enabling* the wow moments: shelves need topics from the same call, search needs the same extraction, and the summary on the card is what makes a grid of 3,000 items scannable at all.

## #7 — Knowledge Graph: the vanity trap

A node-link graph is the most screenshot-able and least-used feature in personal knowledge management. Obsidian's graph view is its most-shared image and among its least-opened panels. It scores **Low on legibility** — users see a pretty constellation and cannot answer a single question with it. Section 12 recommends surfacing relationships **in context** and never as a primary visualisation.

## The wow sequence

```
minute 3     TOPIC SHELVES        "it organised my pile"        ← acquisition
minute 5     SUMMARY              "it read them"                ← credibility
day 1-14     SEMANTIC SEARCH      "it found what I couldn't"    ← retention
week 2+      ASK MY LIBRARY       "it thinks with me"           ← depth / pricing
week 4+      CONTRADICTIONS       "it noticed what I missed"    ← differentiation
month 2+     DAILY BRIEF          "it reaches me"               ← habit
```

**Design mandate:** onboarding is engineered to reach minute 3 as fast as physically possible. Every step between landing and shelves is a step to delete.
---

# 4. USER JOURNEY — DAY 0 TO MONTH 3

## The compounding thesis

Most products are most valuable on day one and decay. This one is deliberately the opposite: **it is worth almost nothing on day zero and increasingly hard to leave by month three.** That is the strategic asset and also the strategic risk — it means the early journey has to *borrow* value it hasn't earned yet. Import is how it borrows.

```
value
  ▲                                                    ╭──── irreplaceable
  │                                              ╭─────╯     (month 3+)
  │                                        ╭─────╯
  │                              ╭─────────╯
  │                   ╭──────────╯
  │        ╭──────────╯
  │   ╭────╯  ← import jumps the curve; without it the
  │  ╱          first month is nearly flat and most users leave
  └──┴────┴──────┴───────┴──────────┴──────────────────► time
   D0   D1     W1      M1          M3
```

---

## DAY 0 — the first ten minutes

**Goal: reach Topic Shelves. Nothing else matters.**

```
0:00   Landing. One sentence, one button.
       "Save anything. It gets understood, organised and searchable."
       [ Continue with Google ]
       No feature tour. No video. No pricing page in the way.

0:15   Signed in. Straight into an empty library.
       The word "workspace" is never shown.

0:20   THE FORK — two doors, and only two:
       ┌──────────────────────────────────────────────┐
       │  Paste a link          [                  ]  │
       │                                               │
       │  ── or bring what you already have ──         │
       │  [ Pocket ]  [ Instapaper ]  [ Raindrop ]     │
       │                                               │
       │  [ Add to Chrome ]  ← the habit step          │
       └──────────────────────────────────────────────┘

0:45   Import chosen. Upload or connect. Progress is honest and live:
       "412 of 2,847 read…" — with real cards appearing as they finish,
       not a bar that fills against nothing.

3:00   ★ TOPIC SHELVES ★
       The library organises itself in front of them.
       Pricing Strategy (94) · AI Agents (212) · Hiring (67)…

5:00   They open a shelf. They open an article. The summary is right.
       ★ CREDIBILITY ★

8:00   They try a search — prompted, because most users won't think to.
       "Try asking for something by what it was about"
       with a suggestion built from their OWN top topic.
       ★ SEMANTIC SEARCH ★

10:00  Extension installed. The habit loop is now possible.
```

**Day 0 success = one import completed + one search performed + extension installed.** Not "signed up." A signup without those three is a user who will not return.

**The single biggest Day 0 risk:** a user with no importable history. They see one card and nothing else. Mitigation — the empty-ish state (<10 objects) shows a *"save five more and your library starts organising itself"* progress affordance, plus 3–5 optional starter links tuned to a one-question interest selection. Not fake content in their library; a genuine on-ramp.

---

## DAY 1 — the return

**Goal: prove it was not a one-time trick.**

The return trigger is a single email, sent ~20 hours after signup, only if the import succeeded:

> **Your library, organised**
> We read 2,847 saved articles. Here's what you've been paying attention to:
> **AI Agents** · 212 · you saved 41 of these in the last month
> **Pricing Strategy** · 94
> **Hiring** · 67
> *Three things you saved but never opened →*

That last line does the work. It is a specific, personal, slightly uncomfortable observation about their own behaviour, and it is only possible because the library was understood. No other product can send this email.

**Day 1 in-product:** they save something *live* for the first time — via the extension, from where they actually read. That save must feel instant: **card visible in under 200ms**, understood within seconds. First live save is the true activation event.

---

## WEEK 1 — habit formation

**Goal: three saves and one successful retrieval.**

| Day | What happens | What it establishes |
|---|---|---|
| 2–3 | 2–5 saves via extension. Reads one or two. | Capture is frictionless |
| 4 | **First real retrieval under pressure** — needs something, searches, finds it | ★★ **The retention moment** ★★ |
| 5–6 | Notices a topic shelf grew. Skims a summary instead of reading. | The library is *working* |
| 7 | First **Weekly Digest** email | The push habit begins |

**Week 1 success = 5+ saves AND 1+ successful retrieval of something saved >48h earlier.** The retrieval is the gate. A user who saves all week and never retrieves has recreated Pocket and will churn on the same timeline Pocket did.

**The intervention that matters:** if a user has 5+ saves and zero searches by day 5, the product must *demonstrate* retrieval rather than wait — a single in-product prompt with a query built from their own content: *"Ask your library: what have I saved about pricing?"* One prompt, once. Never nagging.

---

## MONTH 1 — the library becomes an asset

**Goal: it stops being an app and becomes infrastructure.**

By ~100–200 objects (or day one with an import), qualitative changes:

- **Search beats memory.** They stop trying to remember where something was and just ask. This is the point of no return.
- **Shelves get specific.** *AI Agents* splits into *Agent Memory*, *Tool Use*, *Evals*. The library reflects a sharpening of their own thinking back at them. (Phase 8 clustering — but it lands here in the journey.)
- **Related content earns a click.** The reader's Related panel starts producing genuine "I'd forgotten I saved that."
- **First Ask My Library.** *"What have I saved about agent memory?"* — synthesis across a dozen sources, cited. ★ **THE DEPTH MOMENT** ★ — and the moment upgrade intent forms.
- **First ceiling.** Free tier limits bite. This is the intended conversion window: **after value is proven, never before.**

**Month 1 success = 20+ saves, 5+ searches, 1+ Ask, and a return in week 4.**

---

## MONTH 3 — irreplaceable

**Goal: switching cost is emotional, not just practical.**

- **Contradiction detection lands.** *"Two things you saved disagree about whether long context replaces RAG."* Nobody else does this. It is the feature they describe when someone asks what the product is.
- **The daily brief is a habit.** Robert-types may never open the app; the product reaches them.
- **Audio is in the routine.** Commute listening on summaries.
- **The library is cited in their work.** A PM's spec references a collection. A researcher's paper cites something found here. **The moment the library appears in output, churn approaches zero.**
- **Research reports** turn the library into a producer, not just a store.

**The switching-cost stack at month 3:**

| Layer | Recoverable elsewhere? |
|---|---|
| 500 saved articles | Yes — export |
| Their highlights and notes | Painfully |
| Auto-generated topics and connections | **No** |
| Three months of behavioural signal | **No** |
| The habit of asking the library first | **No** |

The bottom three are the moat, and none of them can be exported to a competitor.

## How value compounds — the four mechanisms

| Mechanism | Effect |
|---|---|
| **Volume → retrieval quality** | More content means semantic search has more to find. The library gets *more* useful per query as it grows, which is the inverse of a folder system. |
| **Volume → connection density** | Edges grow super-linearly with objects. Article 500 connects to things article 5 could not. |
| **Behaviour → personalisation** | Every read, highlight and search sharpens the brief and recommendations. Cannot be bought, only accrued. |
| **Time → contradiction surface** | Contradictions need *temporal spread*. A library six months deep can notice that a field changed its mind. A two-week library cannot. |

---

# 5. INFORMATION ARCHITECTURE

## Evaluating the nine candidates

| Candidate | Verdict | Reasoning |
|---|---|---|
| **Home** | ✘ **Cut** | A second landing surface is just the Library with fewer options. Redirect to Library. |
| **Inbox** | ✘ **Cut → filter** | Inbox-vs-Library forces a user to learn a distinction they did not ask for, and creates an anxiety surface (an unread count that only ever grows). It is `filter=unread`, which is the **default view** of Library. |
| **Library** | ✔ **KEEP — primary** | The product. Everything lives here. |
| **Collections** | ✔ **KEEP** | The only genuine second *place* — objects belong to many collections, so it is a distinct structure, not a filter. |
| **Topics** | ✘ **Cut → view** | Shelves are a *view* of Library, not a destination. Splitting them creates two answers to "where is my stuff." |
| **Search** | ✘ **Cut → omnipresent** | Search must be a persistent input in the header and `⌘K`, never a page you navigate to. Making search a destination adds a click to the most frequent action in the product. |
| **AI / Ask** | ✔ **KEEP** | A conversation has state and history; it is a place. |
| **Research** | ✘ **Cut → mode** | A mode inside Ask that *produces a Library object*. A research report you can search, tag and cite beats one in its own silo. |
| **Settings** | ✔ Keep, demoted | Avatar menu. Never primary nav. |

## The recommendation

> **Three destinations, one omnipresent input, one palette.**

```
┌────────────────────────────────────────────────────────────────┐
│  ◆   Library   Collections   Ask        [ search…    ⌘K ]  [+] │
└────────────────────────────────────────────────────────────────┘

LIBRARY            the one list
  default view       unread, newest first        ← this is "Inbox"
  views              grid · list                 ← §7
  slices             Unread · Starred · Archived · has:audio
                     topic · tag · entity · author · domain · date
  shelves            topic shelves as the default landing layout
                     when the library is large enough to need them
  /reader/[id]       full reader, own route, deep-linkable

COLLECTIONS        manual + smart. The organising surface.
  /collections/[id]   a named, covered, shareable view

ASK                conversation over the library
  research mode      (Phase 9) — writes a report into Library

⌘K                 save · search · jump to object · apply a filter ·
                   open a collection · settings
                   ← the real navigation for anyone past week one

SETTINGS           avatar menu: account · import · plan · privacy · export
```

**Why three and not four or nine:** every additional destination splits the user's mental model of where their knowledge lives, and forces the same list UI to be built and maintained multiple times. Three destinations map exactly onto the three verbs: **find** (Library), **organise** (Collections), **ask** (Ask).

**The nav bar carries no counts and no badges.** An unread count is an anxiety mechanic borrowed from email, and it is precisely the mechanic that made every read-later app feel like a chore. The library is an asset, not a queue.

---

# 6. HOMEPAGE

"Homepage" here means the **logged-in landing** — `/library`. The marketing site is out of scope.

## Above the fold

```
┌─────────────────────────────────────────────────────────────────┐
│  ◆  Library  Collections  Ask     [ search…       ⌘K ]  [+ Save]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Unread · Starred · Archived        Topics ▾    Grid ▾   Sort ▾  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│   │ [cover]  │  │ [cover]  │  │ [cover]  │  │ skeleton │        │
│   │ Title    │  │ Title    │  │ Title    │  │ ▓▓▓▓▓    │        │
│   │ tl;dr…   │  │ tl;dr…   │  │ tl;dr…   │  │ reading… │        │
│   │ ◈ domain │  │ ◈ domain │  │ ◈ domain │  │ ◈ domain │        │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Question | Answer |
|---|---|
| **Above the fold** | Search input · Save button · filter/view controls · **the first row of real cards** |
| **Primary CTA** | **Save.** Persistent, top-right, `⌘K`-reachable. The product's health is a function of save rate; the primary action is never more than one keystroke away. |
| **Secondary CTA** | Search. Physically larger than Save, because it is used more often once the library exists — but Save is the one that is *branded*. |
| **Visible immediately** | Real content within 400ms. Cover, title, **TL;DR**, source. The TL;DR on the card is what makes 3,000 items scannable — it is the difference between a library and a pile. |
| **Never appears** | ✘ Unread badge or count ✘ Onboarding checklist that persists past day 1 ✘ Upgrade banner above the fold ✘ Streaks or gamification ✘ Empty "recommended for you" before signal exists ✘ Modal on load, ever ✘ A "what's new" popover ✘ Anything that makes the library feel like a to-do list |

**The "never" list is a product position.** Every read-later app that died, died of guilt. Unread counts, streaks and nagging convert a pleasure into an obligation. This library is a place you *want* to visit, and that requires refusing the standard engagement toolkit.

## Metrics that matter for this screen

| Metric | Why | Target |
|---|---|---|
| **Time to first meaningful paint** | The whole product's felt speed | <400ms |
| **Save-to-card-visible latency** | The core interaction | <200ms |
| **Search initiation rate** (weekly actives who search) | Leading indicator of retention | >60% by week 4 |
| **Retrieval of items >7 days old** | **The single most important metric in the product** — the hypothesis that separates it from a bookmark folder | >40% of weekly actives |
| **Cards opened per session** | Is the library browsable, or just storage? | >2 |
| **Save rate per active week** | Capture friction | >5 |

**Deliberately not tracked as a goal:** time-in-app and session length. A user who finds what they need in eight seconds got *more* value than one who browsed for ten minutes. Optimising session length would corrupt every other decision in this document.

---

# 7. LIBRARY EXPERIENCE

## The four layouts, evaluated honestly

### Grid
```
┌────────┐ ┌────────┐ ┌────────┐   uniform cards
│ cover  │ │ cover  │ │ cover  │   fixed aspect ratio
│ title  │ │ title  │ │ title  │   predictable scanning path
│ tl;dr  │ │ tl;dr  │ │ tl;dr  │   ~12-20 visible per screen
└────────┘ └────────┘ └────────┘
```
**Strengths** — visually rich; predictable eye path (rows scan left-to-right reliably); handles missing covers gracefully with a generated gradient keyed on domain; the TL;DR fits without crowding; easy to virtualise.
**Weaknesses** — lower density than list; wasted space when covers are poor; ~3–4× more scrolling than a list at high volume.

### List
```
◈ ─────────────────────────────────────────────  dense
  Title of the article                  8 min    ~30-50 per screen
  tl;dr on one line…              #ai #agents    keyboard j/k
◈ ─────────────────────────────────────────────
```
**Strengths** — highest density; fastest keyboard navigation; best for libraries over ~500 items; closest to how power users actually triage.
**Weaknesses** — visually flat; loses the "this is *my* library" feeling that drives emotional attachment; covers reduced to thumbnails or dropped.

### Masonry
```
┌──────┐ ┌──────┐ ┌──────┐   variable height
│      │ │      │ │      │   Pinterest-shaped
│      │ └──────┘ │      │
└──────┘ ┌──────┐ └──────┘
```
**Strengths** — beautiful when covers are consistently good; feels editorial.
**Weaknesses** — **the eye path is unpredictable**, which measurably slows scanning; reflows on image load unless dimensions are known in advance; and critically, **article cover images are wildly inconsistent** — a masonry grid of gradient placeholders in mismatched heights looks broken rather than editorial. Masonry is a layout for a corpus of curated images. This is a corpus of text with occasional images.

### Timeline
```
── This week ───────────────
   ┌────┐ ┌────┐
── Last week ───────────────
   ┌────┐ ┌────┐ ┌────┐
```
**Strengths** — answers "what did I save recently" perfectly; good for the weekly review ritual.
**Weaknesses** — **it answers a question users rarely ask.** Retrieval is by *topic* and *meaning*, not by date. Chronology is how the content arrived, not how the brain looks for it. And it fragments the grid with headers that consume vertical space.

## Recommendation

> **Ship Grid as the default. Ship List as a toggle. Do not build Masonry. Timeline is a *sort*, not a view.**

**Why Grid as default:** the first impression matters more than density, and the grid is what makes a library *feel* like a library rather than a spreadsheet. It carries the TL;DR at a readable size — the single element that makes AI understanding visible on every card. It degrades gracefully when covers are missing, which they often are.

**Why List as the toggle, not the default:** it is objectively better past ~500 items and for triage, and power users will find it immediately. But defaulting to it would show new users a text list on their first screen, which is exactly the impression we are trying to avoid.

**Why not Masonry:** the cover-quality problem is decisive. The layout's benefit is conditional on visual consistency this content type does not have, and the cost — unpredictable scanning, reflow — is unconditional. It is a *SHOULD HAVE* at best, and honestly a *never*.

**Why Timeline is a sort:** "group by week" is a display option on the grid, not a separate mode. It costs a dropdown entry rather than a whole view to build and maintain.

## Trade-off summary

| | Density | Emotion | Scan speed | Cover-tolerant | Build cost |
|---|---|---|---|---|---|
| **Grid** ← default | Med | **High** | High | **High** | Med |
| **List** ← toggle | **High** | Low | **Highest** | **Highest** | Low |
| Masonry | Med | High | **Low** | **Low** | High |
| Timeline | Low | Med | Med | Med | Med |

## Beyond layout

**Shelves as the landing layout.** Once a library passes ~50 objects, the default Library view leads with topic shelves — horizontally scrollable rows per topic — above the full grid. This is where the #1 wow moment lives permanently, not just at import.

**The card must never lie about state.** Four visually distinct states, and this is where most products in this category quietly fail:

| State | What the user sees |
|---|---|
| **Processing** | Skeleton with the **real domain and favicon** already shown — never a blank shimmer |
| **Ready** | Full card |
| **Partial** | Full card, readable, with a quiet marker: *"summary unavailable"* — not a broken card |
| **Failed** | The real reason in plain language (*"this site blocked us"*, *"login required"*) + **Retry** + the original link |

A spinner that never resolves is the single fastest way to lose trust in an ingestion product.

**Bulk actions** — multi-select for tag, archive, add-to-collection, delete. Essential immediately after an import, when a user wants to clear 400 things they no longer care about.

---

# 8. READER EXPERIENCE

## The principle

**The reader is for reading.** Every AI affordance is available and none of them are in the way. The default state is text on a page; everything else is one deliberate gesture away.

```
┌──────────────────────────────────────────────────────────────┐
│  ←  Library            ★  ⊘  ⋯                    Aa   ▷  ◈  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   Why Retrieval Systems Fail in Production                    │
│   Sarah Chen · Mar 14 · 12 min · ◈ engineering.example.com    │
│                                                               │
│   ┌─────────────────────────────────────────────────────┐    │
│   │ Most RAG failures are chunking failures, not model  │    │
│   │ failures. Three patterns account for most of it…    │    │
│   │                              [ Key ideas ⌄ ]        │    │
│   └─────────────────────────────────────────────────────┘    │
│     ↑ TL;DR — collapsed by default after the first read      │
│                                                               │
│   #rag  #retrieval  #evaluation           ← topics, clickable │
│                                                               │
│   ─────────────────────────────────────────────────────      │
│                                                               │
│   The first thing most teams get wrong is treating            │
│   chunking as a preprocessing detail rather than a            │
│   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ← highlight                          │
│   retrieval design decision…                                  │
│                                                               │
│   [ generous measure, ~68ch, real typography ]                │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│  ▁▁▁▁▁▁▁▁▁▁▃▃▃▃▃▃  42%              [ Ask about this ]       │
└──────────────────────────────────────────────────────────────┘

  Right rail (desktop, collapsible; drawer on mobile):
   ◈ Related    ◈ Highlights    ◈ Notes    ◈ Ask
```

## Element-by-element MVP verdict

| Element | Behaviour | MVP? |
|---|---|---|
| **Clean text + typography controls** | Font, size, measure, line height, theme. Persisted per user. **The single highest-impact reader feature** and the thing a reading product is judged on. | ✔ **MVP** |
| **TL;DR** | Above the article, collapsible, remembers its state. Answers "should I read this?" before committing 12 minutes. | ✔ **MVP** |
| **Key ideas** | Expandable under the TL;DR. Bulleted, each linking to its span. | ✔ **MVP** |
| **Topics** | Chips under the header, clickable → filtered library | ✔ **MVP** |
| **Reading progress** | Hairline bar; debounced save; **resumes across devices** | ✔ **MVP** |
| **Star / archive** | In the header, one click, optimistic | ✔ **MVP** |
| **Highlights** | Select → highlight. Survives re-extraction via quote+offset anchoring. **Strongest engagement signal in the product** (§16). | **Week 9–12** |
| **Notes** | Note on a highlight, plus one document-level note | **Week 9–12** |
| **Ask about this** | Persistent bar; streamed answer; **every claim clickable back to its highlighted span in the text** | **Week 9–12** |
| **Related content** | Right rail, 3–5 items, with the *reason* shown (*"also about agent memory"*) | Phase 5 |
| **Audio** | Play in header; mini-player persists across navigation | Phase 7 |
| **Contradictions** | Inline marker where another saved source disagrees | Phase 5 |

## The three reader rules

1. **Nothing overlays the text.** No floating AI bubble, no slide-in panel over the paragraph being read. The rail collapses; the text never moves.
2. **AI is collapsed by default after first view.** The TL;DR is expanded the first time (it is doing its job — triage) and collapsed on return (the user has decided to read).
3. **Every AI claim is clickable back to the source span.** Not a footnote — a *highlight in the article that scrolls into view*. This is the mechanism that makes AI trustworthy in this product, and it is architecturally free because Phase 2 §5 uses the platform's citation feature with character locations.

## What deliberately is not in the reader

| Not building | Why |
|---|---|
| In-reader editing of article text | It is someone else's article. Notes are ours; the text is not. |
| Social annotations / public highlights | A privacy surface with no MVP demand |
| A distraction-free "focus mode" toggle | The default *is* focus mode. A toggle admits the default is cluttered. |
| Inline translation | Real value, wrong phase |
| A comment thread | This is not a social product |
---

# 9. SEARCH EXPERIENCE

## The four-way blend

The brief names four reference products. Each contributes something specific, and the design is the intersection — not a mashup:

| Reference | What we take | What we reject |
|---|---|---|
| **Google** | Relevance ranking that just works. Query forgiveness — typos, plurals, partial phrases. | Ten blue links. Ads. Optimising for time-on-page. |
| **Spotlight** | **Instant.** Keystroke-responsive, keyboard-first, results before you finish typing. Never a page you navigate to. | Filename-literal matching. No understanding. |
| **Perplexity** | A **synthesised answer with citations** above the sources. | Answering from the open web when the user asked about *their* library. |
| **Personal knowledge** | It knows *your* vocabulary, *your* topics, *your* reading history. The result set is small and every item is one you chose. | — |

## The composite

**Spotlight's speed, Google's forgiveness, Perplexity's synthesis — over a corpus you personally curated.** The last clause is the unfair advantage: a 3,000-item corpus that the user selected has a signal-to-noise ratio the open web cannot approach. We are not competing with Google's index; we are searching a set where **every document already passed a human relevance filter.**

## The interface

```
┌──────────────────────────────────────────────────────────────┐
│  ⌕  why do retrieval systems fail                       ⌘K   │
├──────────────────────────────────────────────────────────────┤
│  ⚡ INSTANT                        ← <50ms, keystroke-level    │
│     ◈ Lessons from six months of RAG            title match  │
│     ◈ Chunking strategies compared              title match  │
│     ⌗ rag  ⌗ retrieval  ⌗ evaluation            topics       │
│     ▦ RAG Failures (12)                         collection   │
├──────────────────────────────────────────────────────────────┤
│  ✦ ANSWER                          ← streams, ~1-2s, PRO     │
│     Three failure patterns recur in what you've saved:       │
│     chunk boundaries that split arguments¹, embedding        │
│     models mismatched to the domain², and evaluation         │
│     that measures retrieval instead of answers³.             │
│     ¹ Lessons from six months of RAG · Mar 14                │
│     ² Why your embeddings are wrong · Jan 8                  │
│     ³ Evaluating RAG honestly · Feb 22                       │
├──────────────────────────────────────────────────────────────┤
│  RESULTS  47                    Relevance ▾   All time ▾     │
│                                                               │
│  ◈ Lessons from six months of RAG              ✦ semantic    │
│    "…most failures are chunking failures, not model          │
│     failures…"                        ← the matched span      │
│    engineering.example.com · Mar 14 · 12 min · #rag          │
│                                                               │
│  ◈ Why your embeddings are wrong               ✦ semantic    │
│    "…domain mismatch is invisible until production…"         │
│                                                               │
│  ◈ Chunking strategies compared                ⌕ keyword     │
│                                                               │
│  ── Filters ──────────────────────────────────────────────   │
│  Topics: rag(12) retrieval(9) evals(4)   Unread(31)          │
│  Sources: engineering.example.com(5)      Starred(6)         │
│  Authors: Sarah Chen(3)                   Has audio(2)       │
└──────────────────────────────────────────────────────────────┘
```

## The three tiers, and why the layering matters

| Tier | Latency | What it does |
|---|---|---|
| **1 · Instant** | <50ms | Title, topic, collection and entity prefix matches. Pure index lookup, no vector, no model. **This is what makes search feel like Spotlight** — something appears before you stop typing, always. |
| **2 · Results** | <200ms | The full hybrid query (§14 of Phase 2): keyword + semantic + metadata, RRF-fused. Ranked, faceted, with matched spans. |
| **3 · Answer** | 1–2s, streaming | A synthesised answer over the top results, cited. **PRO only** — this is the metered AI surface. |

Tier 1 exists specifically so the perceived latency of search is ~zero even though tiers 2 and 3 take longer. The user is never looking at an empty box.

## Result design

**Every result shows the matched span, not a generic excerpt.** For a semantic match, the span is *why* the result matched — showing it is what converts a surprising result from "wrong" into "clever." Without it, a semantic hit that shares no keywords with the query looks like a bug.

**Match provenance is labelled** — `⌕ keyword` vs `✦ semantic`. This is a small thing that does disproportionate work: it teaches the user, over a handful of searches, that they *can* search by meaning. Most users have never had a search box that understood them and will not try unless shown.

## Ranking

```
base       RRF( keyword_rank, semantic_rank )       ← Phase 2 §14
  ×  recency boost        gentle, log-decayed
  ×  engagement boost     read / highlighted / opened before
  ×  starred boost        small
  −  archived penalty     present but findable, never hidden
  ×  personal affinity    Phase 8 — small, never enough to bury a match
```

**Recency is a boost, never a filter.** The core promise is finding the thing from eight months ago. A recency *filter* would break the product's central hypothesis. The default range is **All time**, and that default is non-negotiable.

## Zero results — the highest-stakes screen in search

A blank "no results" is where trust in a knowledge product dies, because the user *knows* they saved something. Never show one:

```
Nothing matched "quantum error correction"

  Your library covers these nearby topics:
  ⌗ distributed systems (14)   ⌗ cryptography (6)

  Closest by meaning:
  ◈ Fault tolerance in distributed consensus     62% related
  ◈ Post-quantum cryptography primer             58% related

  Or: search the web and save what you find →
```

The fallback ladder: exact → semantic → topic-adjacent → nearest by embedding distance with the score shown → offer web search. **Something useful always comes back.**

## Query forgiveness

Typos (trigram), stemming, plurals, partial phrases, quoted exact phrases, `-exclusions`, and natural-language queries that read like questions. A user typing *"that article about pricing that mentioned Snowflake"* must get a good result — that is exactly the query shape a personal library should excel at and no keyword system can serve.

---

# 10. ASK MY LIBRARY

**Phase 6.** The highest-ceiling feature and the highest-risk one. Everything below is about managing that risk.

## How conversations work

```
┌──────────────────────────────────────────────────────────────┐
│  Ask your library                              ⌗ 2,847 items │
├──────────────────────────────────────────────────────────────┤
│  You  Summarise what I've saved about agent memory and       │
│       tell me where sources disagree                          │
│                                                               │
│  ✦    ⌕ searching your library…              ← visible work   │
│       ⌕ found 23 relevant passages across 11 articles         │
│       ✦ reading 6 sources…                                    │
│                                                               │
│       Your sources converge on three approaches — vector      │
│       stores¹, summarisation buffers², and structured         │
│       scratchpads³ — but disagree sharply on retention.       │
│                                                               │
│       ⚠ Two sources directly conflict:                        │
│         Anthropic's post⁴ argues aggressive compaction is     │
│         nearly free; the LangChain writeup⁵ measured 12%      │
│         task degradation from the same approach.              │
│                                                               │
│       ¹ Building agent memory · Feb 3         [ open ▸ ]      │
│       ² Context management patterns · Jan 19  [ open ▸ ]      │
│       ⁴ Effective context engineering · Apr 2 [ open ▸ ]      │
│       ⁵ What we learned shipping agents · Mar 30 [ open ▸ ]   │
│                                                               │
│       Based on 11 of 2,847 items · 6 read in full             │
├──────────────────────────────────────────────────────────────┤
│  [ Ask a follow-up…                          ]  [ Save ▾ ]   │
└──────────────────────────────────────────────────────────────┘
```

**Design decisions:**

- **The work is visible.** Showing "searching… found 23 passages… reading 6" is not a loading animation — it is the trust mechanism. The user sees *which* library was consulted and *how much* of it, so the answer arrives with a provenance story already told.
- **Conversations persist**, are titled from the first question, and are searchable. An answer you cannot find again is an answer you have to ask for twice.
- **Follow-ups keep retrieval context** but re-retrieve — a follow-up often needs different sources than the original.
- **"Save this answer"** turns a good synthesis into a `knowledge_object` of its own: searchable, taggable, and citable later. This is the loop that makes the library produce, not just store.
- **Scope selector** — ask the whole library, one collection, or the current article. Narrow scope is both cheaper and more accurate, and users reach for it naturally once shown.

## How citations work

| Rule | Implementation |
|---|---|
| **Every claim carries a citation** | Not a bibliography at the bottom — an inline marker on the specific sentence |
| **Citations are clickable into the source span** | Opens the reader, scrolls to the passage, **highlights it**. Verification is one click, not a research task. |
| **The span is real, not paraphrased** | Uses the platform's document-citation feature (Phase 2 §5), which returns the exact cited text and its character location. We do not ask a model to report its own sources — a model reporting its sources is a model that can invent them. |
| **Coverage is shown honestly** | *"Based on 11 of 2,847 items"* — the user always knows the answer is partial, because it always is. |

## How trust is built

Trust in an AI feature is not built by being right. It is built by being **verifiable, bounded, and honest about limits.** Four mechanisms:

1. **Verifiability** — every claim is one click from its evidence. A user who checks twice and finds it accurate stops checking. A user who cannot check never starts trusting.
2. **Visible scope** — the user sees what was searched and how much was read. Ambiguity about scope is where suspicion grows.
3. **Calibrated language** — *"Two sources cover this, both from the same author"* rather than a confident summary of thin evidence. The system says how strong its ground is.
4. **Willing ignorance** — *"I don't know"* is a designed, styled, first-class response, not a failure path. A system that admits limits is trusted on the things it does assert.

## How hallucinations are minimised

Five controls, in order of strength — note that four of the five are **architectural**, not prompt-level:

| # | Control | Type |
|---|---|---|
| 1 | **No citation, no claim.** A sentence that cannot be grounded in a retrieved span is removed before display, not shown with a hedge. | Architectural |
| 2 | **Answer only from retrieved context.** No world knowledge fills gaps. If the library doesn't cover it, the answer says so and offers to search the web *as a separate, labelled action*. | Architectural |
| 3 | **Citations come from the platform's citation feature**, which returns exact spans and offsets — never from the model self-reporting which document it used. | Architectural |
| 4 | **Retrieval scope is set by code, never by the model** (Phase 2 §13). The model cannot widen its own evidence base. | Architectural |
| 5 | **Grounding evaluated in CI** on a labelled question set, measuring citation coverage and span accuracy, gating every release. | Process |

**The hard rule:** *a wrong answer with a citation is recoverable — the user clicks, sees the mismatch, and calibrates. A wrong answer without one is not.* Ungrounded output is the only truly unacceptable failure mode in this product.

## Why this is Phase 6, not the MVP

It needs a populated library to be impressive, solid citations to be trustworthy, and the injection-resistance work from Phase 2 §24 to be safe. Shipping it early and shipping it wrong would poison the feature permanently — users who see one confident fabrication do not come back to try version two.

---

# 11. COLLECTIONS

## The answer: hybrid, with automatic leading

> **Automatic organisation is the default and requires nothing. Manual collections exist for the small set of things people genuinely want to curate.**

**Why not manual-only:** manual collections are how every previous product in this category failed. Pocket had tags — almost nobody used them. Raindrop has folders — the diligent minority maintain them, everyone else has a junk drawer. **Any system that depends on user discipline decays**, and the users who need it most are exactly the ones with the least time to maintain it. The core product bet (§1) is a knowledge system whose value does not depend on discipline.

**Why not automatic-only:** automatic organisation cannot know that these fourteen articles are "research for the Q3 pricing decision." That grouping exists in the user's intent, not in the content. Purely automatic organisation also removes agency — and a library you cannot arrange is not *yours*.

**Why hybrid, in this specific shape:** automatic handles the 90% nobody would ever have filed, manual handles the 10% with real intent, and smart collections bridge them.

## The three kinds

### 1. Topic Shelves — automatic, zero effort, always on

Derived from the topics the understanding stage already extracts. Not a user-facing "collection" object — a **view** of the library. Always current, never stale, requires nothing.

*Cheap version (8-week build): group by extracted topic label, count, show as shelves. Rich version (Phase 8): semantic clustering that splits `AI Agents` into `Agent Memory` / `Tool Use` / `Evals` and names the clusters.*

This is the #1 wow moment (§3), and it lives here permanently — not just at import.

### 2. Smart Collections — a saved query with a name

```
  ▦  RAG Research
     topic:rag OR topic:retrieval · unread · saved after Jan 1
     ↻ updates automatically · 31 items
```

Created from any search or filter state via **"Save this view."** The bridge between automatic and manual: the user expresses intent once, and the collection maintains itself forever. Architecturally free — Phase 2 §6 already defines `is_smart` + `rule`.

### 3. Manual Collections — deliberate curation

For the cases where intent cannot be derived: *"Q3 pricing research"*, *"reading list for the team"*, *"sources for the talk"*. Named, covered, ordered, and — from Phase 10 — the primary shareable object.

## Making automatic collections trustworthy

The failure mode of automatic organisation is a shelf that is subtly wrong, which is worse than no shelf at all. Three mitigations:

| Mitigation | Effect |
|---|---|
| **Always correctable** | Remove an item from a shelf, rename a topic, merge two topics. Corrections persist and **permanently outrank the model** (Phase 2's `source` column on tags does exactly this). |
| **Never destructive** | Automatic grouping is a *view*. It never moves, hides, or deletes anything. The full library is always one click away. |
| **Explains itself** | *"Grouped because these discuss agent memory"* — never an unexplained bucket. |

## The AI Collections moment (Phase 8)

```
  ✦ We noticed a pattern

    17 things you saved over 3 months are about
    evaluating LLM outputs — from 9 different sources.

    [ Make this a collection ]   [ Not useful ]
```

Proactive, occasional (at most weekly), and always dismissible. "Not useful" is a real training signal, not a dismissal. This is the product noticing something about the user that the user had not noticed about themselves — the strongest emotional beat available to a knowledge system.

---

# 12. KNOWLEDGE GRAPH

## The answer: hidden by default, surfaced in context, never a primary visualisation

> **Ship the graph's *value* in the MVP-adjacent phases. Do not ship the graph's *picture* — or if you do, ship it as a Phase 12 curiosity, clearly secondary.**

## Why "visible" is the wrong answer

A node-link graph is the most screenshot-shared and least-used feature in personal knowledge management. Obsidian's graph view is its most recognisable image and among its least-opened panels. The reason is structural, not cosmetic:

| Problem | Detail |
|---|---|
| **It answers no question** | Users ask *"what else is about this?"* and *"what contradicts this?"* — both of which are lists. Nobody asks *"what does the topology of my knowledge look like?"* |
| **It degrades with scale** | Beautiful at 50 nodes. A hairball at 500. Unusable at 3,000 — which is the target library size. |
| **It demands interpretation** | The user must decode a visualisation to extract a fact a sentence could have told them. |
| **It is opened twice** | Once out of delight, once to show someone. Then never. |

**It is a vanity feature**: it makes the product look intelligent without making the user more capable. That is precisely the trade this product should refuse.

## Why "hidden" is right — the value without the picture

The graph's value is real and belongs everywhere *except* a graph view:

| Surface | What the graph does | Phase |
|---|---|---|
| **Reader → Related** | 3–5 items **with the reason stated**: *"also about agent memory"*, *"same author"*, *"this article links to it"* | 5 |
| **Reader → Contradictions** | An inline marker: *"a source you saved disagrees with this paragraph"* — **the single most differentiating moment in the product** | 5 |
| **Entity pages** | *"Everything you've saved about Anthropic — 34 items, 6 months, 3 disagreements"* | 5 |
| **Search ranking** | Well-connected objects rank slightly higher | 5 |
| **Ask My Library** | Uses `contradicts` edges as retrieval seeds to answer "where do sources disagree" | 6 |
| **Auto Collections** | Clusters derive from entity and topic co-occurrence | 8 |

Every one of those is a **list or a sentence** delivered exactly where the user is already looking. That is the graph doing its job invisibly.

## The one visualisation worth building

Not a global graph. A **local, one-hop map from a single object**, opened on demand from the Related panel:

```
                    ┌─────────────────┐
      contradicts   │  THIS ARTICLE   │   expands
    ◄───────────────│  RAG failures   │──────────────►
   ┌────────────┐   └────────┬────────┘   ┌────────────┐
   │ Long ctx   │            │            │ Chunking   │
   │ replaces…  │       mentions          │ compared   │
   └────────────┘            │            └────────────┘
                    ┌────────▼────────┐
                    │  ⌗ evaluation   │
                    └─────────────────┘
```

Bounded, legible, and it answers a real question: *"how does this connect to what I already know?"* Phase 5, secondary placement. A global graph view, if ever built, is Phase 12 and explicitly a delight feature — never in primary navigation.

---

# 13. DAILY BRIEF

**Phase 8.** The push surface. Strategically important because it is the only part of the product that **reaches the user instead of waiting for them** — and it is the entire retention mechanism for the Executive persona, who may never open the app.

## Morning Brief — daily, email + in-app

```
  Tuesday, 12 September

  ─── FROM YOUR LIBRARY ────────────────────────────────
  You saved 6 things yesterday. Two are worth 10 minutes:

  ◈ The economics of inference                    8 min  ▷
    Argues serving cost, not training cost, decides
    who wins. Connects to 4 things you've saved on
    unit economics.

  ◈ What we learned shipping agents               12 min ▷
    ⚠ Disagrees with the Anthropic post you read
      last week on compaction.

  ─── STILL WAITING ────────────────────────────────────
  ◈ Pricing power in vertical SaaS   saved 9 days ago
    Your most-read topic. 6 min.        [ Listen ▷ ]

  ─── ONE FROM THE ARCHIVE ─────────────────────────────
  ◈ Why retrieval systems fail       saved 4 months ago
    Relevant to the 3 things you saved this week.
```

**Design decisions:**

- **Two items, not ten.** A brief that takes ten minutes to triage is another inbox. Ruthless selection is the feature.
- **The "one from the archive" section is the emotional core** — the daily proof that saving something is not the same as losing it. It is also the only section no competitor can produce.
- **Every item has a reason attached**, drawn from the graph or from reading history. A list without reasons is a newsletter.
- **Audio on every item.** For the Executive, this email *is* the product.
- **Sent when the user actually reads.** Learned from open times, not a fixed 7am. Skipped entirely on days with nothing worth saying — **a brief that is sometimes absent is trusted more than one that is always full.**

## Weekly Digest — Sunday

```
  Your week: 14 saved · 6 read · 2h 40m · 9 highlights

  YOU FOCUSED ON        AI agents (7) ↑ up from 2 last week
                        Pricing (3)

  YOU DIDN'T GET TO     8 items — 3 have been waiting 3+ weeks
                        [ Archive them ]  [ Listen to summaries ]

  A CONNECTION          Three things you saved this week all
                        argue evals matter more than models.
                        [ Make this a collection ]

  A DISAGREEMENT        Two sources conflict on whether long
                        context replaces RAG.        [ Compare ]
```

Weekly is where **cleanup** belongs. Offering to archive the 3-week-old unread pile removes guilt in one click — this is the product actively refusing to become a source of obligation (§6).

## Monthly Intelligence — the retention artefact

Not a digest. A **short report about the user's own thinking**, and the most emotionally powerful artefact the product produces:

```
  September · 47 saved · 23 read · 61 highlights

  HOW YOUR ATTENTION MOVED
  Agent architecture ↑ 3× · Pricing ↓ · New: evaluation

  WHAT YOU'RE CONVERGING ON
  Across 12 sources, you're building a consistent view that
  evaluation is the bottleneck. Your highlights cluster here.

  WHERE YOUR SOURCES DISAGREE
  3 unresolved contradictions in your library.  [ Review ]

  WHAT YOU SAVED AND NEVER OPENED
  19 items. 14 are about topics you've stopped reading.
  [ Archive all ]              ← permission to let go

  YOUR MOST-CITED SOURCES
  ◈ engineering.example.com (8) · Sarah Chen (5)
```

*"Across 12 sources you're building a consistent view that evaluation is the bottleneck"* is a sentence no other product can write. It requires understanding every article, tracking highlights, and comparing across months. **This is the artefact people screenshot and share, and it is the strongest single argument for the paid tier.**

## Brief hygiene

| Rule | Reason |
|---|---|
| Skip when there is nothing to say | An always-full brief is noise; an occasional one is signal |
| Never more than 3 items in the daily | Selection is the value |
| Always a reason attached | Otherwise it is a newsletter |
| One-click unsubscribe per cadence | Daily off, weekly on must be trivial |
| Nothing in the brief is exclusive to email | Every section has an in-app equivalent |

---

# 14. MOBILE EXPERIENCE

## The principle

**Mobile is for capture and consumption. Desktop is for retrieval and thinking.** Trying to make mobile a full peer of desktop is how this product would get bloated and slow. The phone does three things superbly and nothing else.

## The three mobile workflows

### 1. SAVE — the most important workflow in the entire product

```
   Any app → Share → [ ◆ ]
   ┌────────────────────────────┐
   │  ✓ Saved                   │  ← <500ms, sheet dismisses
   │  Why retrieval systems…    │
   │  [ + tag ]  [ collection ] │  ← optional, ignorable
   └────────────────────────────┘
```

**Under 500ms, one tap, no login prompt, works offline** (queues and syncs). This is where the majority of saves originate — people encounter links on their phone. If this is slow or unreliable, nothing else in the product matters.

### 2. READ — the commute and the queue

Full reader with typography controls, offline-cached, progress synced to desktop. Swipe to archive, swipe to star. Highlights work (fiddly on touch, but essential — and it is where a lot of reading actually happens).

### 3. LISTEN — the mobile-native feature (Phase 7)

```
   ┌────────────────────────────┐
   │  ▷  The economics of…      │
   │  ▬▬▬▬▬▬▬▬▬▬▭▭▭▭  4:12/8:30 │
   │  ⏮  ⏸  ⏭      1.5×  ⌄     │
   └────────────────────────────┘
```

Lock-screen and CarPlay controls, background playback, queue, offline download, position synced across devices. **Audio is the one feature where mobile is the primary platform, not a reduced version** — and for the Executive persona it may be the only surface they use.

## Mobile navigation

```
   ┌──────────────────────────────┐
   │  Library            ⌕    +   │
   ├──────────────────────────────┤
   │   [ single-column cards ]     │
   ├──────────────────────────────┤
   │   ▷ now playing (when active) │
   ├──────────────────────────────┤
   │   Library   Ask   Profile     │
   └──────────────────────────────┘
```

Three tabs, not five. Single-column cards — **not a two-column grid**, which makes titles unreadable and TL;DRs impossible at phone width.

## What gets removed on mobile

| Removed | Why |
|---|---|
| Collection management (create, reorder, curate) | Deliberate curation is a desk activity |
| Bulk operations | Multi-select on touch is miserable |
| Import | Requires file handling and long-running attention |
| Advanced search filters | Simple search only; complex filtering is desktop |
| Knowledge graph views | Unusable at phone size |
| Research mode | Long-running, needs a large result surface |
| Settings depth | Account and notifications only |

**Kept because they are genuinely mobile-native:** save, read, listen, search (simple), star/archive, ask-about-this-article, the daily brief.

> **DECISION** — PWA first, native app in Phase 8+.
> **REASON** — the share sheet is the only genuinely native requirement, and both iOS and Android support share targets for installed PWAs. One codebase reaches both platforms during the phase when the product is still changing weekly.
> **TRADE-OFF** — background audio and lock-screen controls are meaningfully better native. That is exactly why the native app arrives alongside audio in Phase 7–8, and not before.

---

# 15. RETENTION

## The three loops

Different personas return on different rhythms. A product that only has a daily hook loses the Founder; one that only has a monthly artefact never forms a habit.

### DAILY — *"is there anything I should see?"*

| Hook | Persona | Strength |
|---|---|---|
| **Morning brief** (email/push) | Executive, Founder | **Strongest** — reaches the user |
| **Save from the extension** | AI Builder, Knowledge Worker | Strong — but it is a *usage* loop, not a *return* loop |
| **Audio on the commute** | Executive, Founder, Student | Strong, and habit-shaped |
| **Ask about something read today** | AI Builder | Medium |

**The honest read:** most users will not open this app daily, and designing for daily opens would mean adopting the engagement tactics §6 explicitly refuses. **The daily loop is push, not pull.** The brief and audio reach the user; the app does not demand attention.

### WEEKLY — *"what did I collect, and what should I do with it?"*

| Hook | Persona | Strength |
|---|---|---|
| **Weekly digest** with the archive-cleanup action | All | **Strongest** |
| **Retrieval under pressure** — needing something for real work | Knowledge Worker, PM, Founder | **The truest signal in the product** |
| **Weekend reading session** on the backlog | Researcher, Student | Strong |
| **New connections surfaced** since last week | AI Builder, Journalist | Medium |

**Weekly is the natural rhythm of this product**, and weekly actives — not daily — is the right north-star engagement metric.

### MONTHLY — *"what has this become?"*

| Hook | Persona | Strength |
|---|---|---|
| **Monthly intelligence report** | All | **Strongest** — the screenshot artefact |
| **Project restart** — a new spec, a new story, a new paper | PM, Researcher, Journalist | Strong — reactivates dormant users |
| **Research report generation** | Knowledge Worker, Researcher | Strong |
| **Contradiction review** | Researcher, Journalist | Medium |

## The retention hierarchy

```
   STRONGEST   The library contains something they cannot get elsewhere
               and cannot recreate
                  ↑
               Successful retrieval under real pressure
                  ↑
               The brief tells them something they didn't know
                  ↑
               Habitual capture (the extension is installed)
                  ↑
   WEAKEST     Notifications, streaks, badges     ← we do not use these
```

Every retention mechanism in this product sits in the top four bands. **The bottom band is explicitly rejected** (§6): it works, briefly, and it converts a pleasure into an obligation — which is the exact failure mode that killed every read-later app before this one.

## The three churn moments and their counters

| Moment | Signal | Counter |
|---|---|---|
| **Day 3–7: "I saved things and nothing changed"** | 5+ saves, 0 searches | One in-product prompt demonstrating retrieval, using a query built from their own content. Once. Never repeated. |
| **Week 3–4: "the backlog feels like guilt"** | Growing unread, falling opens | The weekly digest's **archive-cleanup** action. Explicitly grant permission to let go. Never show an unread count. |
| **Month 2–3: "I forgot it exists"** | No opens in 14 days | The monthly intelligence report — the most valuable artefact, timed exactly for the reactivation window. |

## The metric that matters most

**Percentage of weekly actives who retrieve something saved more than 7 days ago.**

Save rate measures capture. Session length measures nothing useful. **Old-item retrieval measures whether the library is a brain or a graveyard** — and it is the single number that predicts long-term retention, willingness to pay, and word of mouth. If this number is healthy and everything else is mediocre, the product works. If it is weak, nothing else can save it.
---

# 16. MONETIZATION

## The pricing thesis

**Storage is free. Understanding is paid.**

Saving and keeping things costs us almost nothing and is the habit we need to form. AI processing, questions, research and audio are where real cost sits — and where real value sits. Pricing follows cost, which makes it defensible to explain and honest to enforce.

The corollary: **do not gate the wow moments.** Topic shelves and semantic search are free. A free user must experience *why* this product is different, or they will never convert. Gating the differentiator to protect the paid tier is how you build a product nobody talks about.

## The plans

| | **FREE** | **PRO** — $12/mo · $110/yr | **TEAM** — $20/user/mo |
|---|---|---|---|
| **Positioning** | Prove the magic | The individual product | Shared knowledge |
| Saved items | **100** | Unlimited | Unlimited |
| Extraction + reader | ✔ | ✔ | ✔ |
| **AI summaries + topics** | **First 100** | Unlimited | Unlimited |
| **Topic shelves** | **✔** | ✔ | ✔ |
| **Semantic search** | **✔ full** | ✔ | ✔ |
| Import | ✔ (up to the 100 cap) | ✔ unlimited | ✔ unlimited |
| Highlights + notes | ✔ | ✔ | ✔ |
| Collections | 3 | Unlimited | Unlimited |
| **Ask My Library** | **20 / mo** | **500 / mo** | Pooled |
| Related content + graph | — | ✔ | ✔ |
| **Contradiction detection** | — | **✔** | ✔ |
| Daily / weekly brief | Weekly only | ✔ all | ✔ all |
| **Monthly intelligence** | — | **✔** | ✔ |
| Audio | 10 min/mo | **300 min/mo** | Pooled |
| Research reports | — | 10 / mo | Pooled |
| Public sharing | — | ✔ | ✔ |
| Content creation | — | ✔ | ✔ |
| Shared collections | — | — | **✔** |
| Members / roles / SSO | — | — | ✔ |
| Export | ✔ | ✔ | ✔ |

**POWER USER** ($30/mo) is a *later* consideration, not a launch tier. Three tiers is already one more decision than most users want to make; a fourth should only exist once usage data proves a real cohort is hitting PRO ceilings.

## The decisions inside the pricing

| Decision | Reasoning |
|---|---|
| **Semantic search is free and uncapped** | It is wow moment #2 and the retention proof. A free user who never experiences it has no reason to convert — they experienced a bookmark manager. This is the most important pricing decision here. |
| **Topic shelves are free** | Wow moment #1. Same argument, more so. |
| **100 items free, not 50 or unlimited** | 100 is enough for shelves and search to genuinely work, so the magic is real. It is also roughly one month of an engaged user, so the ceiling arrives *after* value is proven — the correct conversion window (§4, Month 1). |
| **Ask is metered, not gated** | 20/mo lets a free user taste it. Gating it entirely means nobody knows what they are buying. |
| **Contradiction detection is PRO-only** | The single most differentiated capability. It needs a large library to mean anything, which correlates with paid users anyway. This is the feature people upgrade *for*. |
| **Monthly intelligence is PRO-only** | The screenshot artefact. Also the strongest reactivation hook, which makes it worth paying for. |
| **Export is free, always, everywhere** | A knowledge product that holds data hostage does not deserve trust. It also costs us nothing and removes the single biggest objection to committing a library to us. |
| **Audio is generously metered, not unlimited** | The highest marginal cost per unit in the product (Phase 2 §20). 300 minutes covers real commute usage; unlimited invites abuse. |
| **Students** | 50% off with verification. Per §2.9, this is a marketing cost with a three-year payback, budgeted as such. |

## Conversion design

**Never** an upgrade banner above the fold, an interstitial, or a feature dangled with a lock icon in the primary flow.

**Always** contextual, at the exact moment of felt need:

```
   ┌──────────────────────────────────────────────────┐
   │  ⚠ Two of your sources disagree about this        │
   │                                                    │
   │  Contradiction detection compares claims across   │
   │  your library and shows you where they conflict.  │
   │                                                    │
   │  [ See the conflict → ]      Pro · $12/mo         │
   └──────────────────────────────────────────────────┘
```

The user is shown that a real conflict *exists in their own library* before being asked to pay to see it. The value is demonstrated, not described. Same pattern at the 100-item ceiling (*"your library is full — and it's just started getting interesting"*) and at the Ask limit.

**Degradation, never denial** (Phase 2 §23): hitting an AI ceiling never breaks saving. Objects still save, extract and stay keyword-searchable; only the AI stage pauses, with a clear message — and it resumes automatically when the period rolls over. A user who hits a limit should feel a ceiling, not a wall.

---

# 17. COMPETITIVE ANALYSIS

## The single most important market fact

**Pocket shut down in 2025.** Mozilla wound down the service, leaving millions of users with an export file and nowhere obvious to put it. That event is the strategic backdrop for this entire product:

- It **validates that the category has demand** but that read-later alone is not a business.
- It created a **displaced, motivated, self-identified user base** actively looking for a destination.
- It makes **import the highest-ROI feature in the MVP** — these users arrive with a file in hand and intent already formed.

This is why import is a MUST-HAVE (§18) and not a nice-to-have. It is a distribution channel disguised as a feature.

---

### Pocket *(discontinued 2025)*

| | |
|---|---|
| **Strengths** | Effortless save. Enormous brand recognition in the category. Genuinely good extraction. Simple to the point of invisible. |
| **Weaknesses** | Storage without understanding. Tags nobody used. Search that was essentially keyword-over-title. No reason to return. Never monetised its premium tier meaningfully. |
| **Opportunity** | **Be the obvious destination for the export file.** Explicit, prominent Pocket import; onboarding copy that names it; content aimed at "where do I move my Pocket library." The users are looking; the question is who makes it easy. |

### Readwise Reader

| | |
|---|---|
| **Strengths** | **The strongest direct competitor.** Excellent reader. Best-in-class highlight capture and spaced-repetition review. Deep integrations (Kindle, Twitter, RSS, podcasts). Fiercely loyal power-user base. Real revenue. |
| **Weaknesses** | **Built for the disciplined.** It rewards effort — reviewing, tagging, exporting to Obsidian — which means it serves the top decile of knowledge workers and loses everyone else. Its AI is bolted on rather than foundational. Organisation is still the user's job. Interface is dense and intimidating on first run. |
| **Opportunity** | **Serve the 90% who will never maintain a system.** Readwise's implicit promise is *"we'll help you review what you read."* Ours is *"you don't have to."* That is a genuinely different product for a genuinely larger market — and it is not a market Readwise can pivot into without abandoning its base. |

### Matter *(effectively dormant)*

| | |
|---|---|
| **Strengths** | Best-in-class visual design and reading typography in the category. Excellent audio narration — the feature that defined it. Genuinely pleasant to use. |
| **Weaknesses** | Beautiful but thin. Design excellence without a durable retrieval or intelligence layer. Never solved *why you come back*, which is ultimately what limited it. |
| **Opportunity** | **Two lessons, both important.** (1) Design quality alone does not retain — it earns the first session and nothing more. (2) **Audio was the right instinct**, and it remains underserved. Take the audio ambition seriously (Phase 7) while making sure retrieval, not aesthetics, is the retention engine. |

### Raindrop.io

| | |
|---|---|
| **Strengths** | Excellent pure bookmark manager. Fast, reliable, generous free tier, beautiful collection views. Strong at visual bookmarking of non-article content — products, design, references. |
| **Weaknesses** | **Zero understanding.** It stores links and covers; it never reads them. Organisation is entirely manual — folders and tags you maintain forever. Search is keyword over titles and your own tags. |
| **Opportunity** | Their power users have already demonstrated willingness to invest effort in organisation. **Show them the organisation happening automatically**, and the value proposition is immediate and legible. Raindrop import is a MUST alongside Pocket. |

### Notion

| | |
|---|---|
| **Strengths** | Infinite flexibility. Already where a lot of professional knowledge lives. Notion AI is competent. Team collaboration is genuinely solved. |
| **Weaknesses** | **Nothing is automatic.** You design the database, define the properties, and maintain the discipline. Web clipping is mediocre — it captures poorly and does not understand what it captured. It is a *construction kit*, not a knowledge system. Search is weak at scale. |
| **Opportunity** | **We are not competing — we are upstream.** Notion is where *authored* knowledge goes; we are where *encountered* knowledge goes. An export-to-Notion integration is a feature, not a concession, and it neutralises the "but I already use Notion" objection entirely. |

### Perplexity

| | |
|---|---|
| **Strengths** | Set the bar for cited AI answers. Excellent synthesis. Spaces gestures toward personal collections. Strong brand in AI search. |
| **Weaknesses** | **It searches the web, not your library.** Every answer starts from zero — it has no memory of what *you* have read, chosen, or highlighted. Spaces is shallow. No reading experience. It answers questions; it does not accumulate knowledge. |
| **Opportunity** | **The corpus is the moat.** Perplexity searches everything and knows nothing about you. We search a small corpus you personally curated — every document already passed a human relevance filter, which is a signal-to-noise advantage the open web cannot match. *"Perplexity for what you've already read"* is an accurate and compelling framing. |

### ChatGPT

| | |
|---|---|
| **Strengths** | Universal familiarity. Enormous capability. Projects and memory are moving toward persistent context. Zero acquisition friction. |
| **Weaknesses** | **No capture loop.** You cannot save an article to it from your phone in one tap and expect it there in six months. Memory is opaque, unstructured and unauditable. No library, no reader, no browsing, no organisation. It is a conversation, not a corpus. |
| **Opportunity** | **The most dangerous competitor and the least direct one.** Dangerous because "just paste it into ChatGPT" satisfies a real portion of the need and costs nothing. Least direct because it has no persistent, structured, browsable, growing library. Our defence is the **capture loop and the corpus** — the two things a chat interface structurally does not have. The differentiator to lean on is not answer quality; it is that our answers come from a corpus *you chose*, with citations you can open. |

## Positioning map

```
                        UNDERSTANDS CONTENT
                                ▲
                                │
            Perplexity ●        │        ● US
            ChatGPT ●           │
                                │
   NO LIBRARY ──────────────────┼────────────────── OWNS A LIBRARY
                                │
                                │        ● Readwise Reader
                                │        ● Notion
                                │        ● Raindrop
                                │        ● Pocket (†)
                                ▼
                          STORES CONTENT
```

**The top-right quadrant is empty.** Products that understand content do not own your library; products that own your library do not understand it. That gap is the entire opportunity, and it is why the answer to *"why hasn't someone built this"* is *"because until recently the understanding half was not economically possible."*

## The two-sentence competitive story

> Readwise Reader is the best product for people who will maintain a system. **We are for everyone else.**
> Perplexity searches the whole web and knows nothing about you. **We search the small part you already chose.**

---

# 18. THE 8-WEEK MVP

## The constraint

Eight calendar weeks. Assume **3 engineers + v0 for interface**. That is roughly 24 engineer-weeks, and Phase 2's Foundation phase alone is a meaningful fraction of it.

**This is materially smaller than Phase 2's MVP.** Phase 2 defined the smallest *valuable* product. This defines what actually fits, which is less. The cut below is honest about that.

## The one thing this MVP must prove

> **A user brings their existing reading pile, and within five minutes finds something they could not have found before.**

Everything that does not directly serve that sentence is cut.

## SHIPS — weeks 1–8

| # | Capability | Why it survives |
|---|---|---|
| 1 | **Google sign-in only** | Email/password is a week of edge cases (reset, verification, deliverability) for zero learning. Add it later. |
| 2 | **Save: paste + Chrome extension** | The extension is not optional. Saving must be one click from where reading happens, or no habit forms. |
| 3 | **Async ingestion pipeline** with honest status | Everything sits on it. Non-negotiable (Phase 2 §10). |
| 4 | **Extraction** — graby sidecar + readability fallback + metadata-only tier | The product is worthless if articles come back empty. **Skip the headless-browser tier** — accept `js_required` as an honest failure state in v1. |
| 5 | **Import: Pocket, Instapaper, Raindrop** | **The highest-ROI feature in the build.** Pocket's shutdown created the demand; the file is already in the user's hand. Solves cold start and makes the proof sentence achievable in minute three. |
| 6 | **AI understanding** — TL;DR, summary, key ideas, topics, tags (one call) | Powers the card, the shelves and the search. One call, per Phase 2 §11. |
| 7 | **Library: Grid + List, filters, sort** | Grid default, List toggle. **No masonry, no timeline.** |
| 8 | **Topic Shelves** (cheap version) | **Wow moment #1.** Grouping and counting over topics the pipeline already extracts — days of work, not weeks. |
| 9 | **Hybrid search** — keyword + semantic + filters, with matched spans | **Wow moment #2 and the retention proof.** The single most important capability in the build. |
| 10 | **Reader** — typography, TL;DR, topics, progress, star/archive | Where value is consumed |
| 11 | **Cost ledger + quotas** | Prevents an unpayable bill and starts unit-economics learning in week one |
| 12 | **Security baseline** — SSRF hardening, HTML sanitisation, CSP, RLS, rate limits | Non-negotiable given arbitrary URL ingestion |

## CUT — postponed to weeks 9–16

| Cut | Was it in Phase 2's MVP? | Why it survives the cut and why it waits |
|---|---|---|
| **Ask This Article** | Yes | **The most painful cut here.** It is the trust moment. But summary + search already prove "AI makes saved content more useful," and the citation-grounding work deserves proper time rather than a rushed version that teaches users not to trust it. **Weeks 9–12.** |
| **Highlights + notes** | Yes | The strongest engagement signal (§15), so cutting it costs measurement. But offset re-anchoring across re-extraction is fiddly, and doing it badly loses users' highlights — the one thing they will never forgive. **Weeks 9–12.** |
| **Mobile share sheet / PWA** | Yes | Desktop-first for eight weeks. Mobile capture is critical, but the PWA share target plus offline queueing is its own workstream. **Weeks 9–12, alongside the reader polish.** |
| **Manual collections** | Should-have | Topic shelves cover organisation for a first library. Smart collections cover intent. Manual curation can wait. **Weeks 13–16.** |
| **Email/password auth** | Yes | Google covers the target personas almost entirely. |
| **Export** | Should-have | A trust signal nobody exercises in month one — but it must ship before any paid tier does. **Weeks 13–16.** |
| **Bulk actions** | — | Needed right after a big import. First fast-follow after launch. |

## POSTPONED — unchanged from Phase 2's roadmap

Audio (Ph 7) · Ask My Library (Ph 6) · Knowledge graph and contradictions (Ph 5) · Related content (Ph 5) · Daily/weekly/monthly briefs (Ph 8) · Recommendations (Ph 8) · Research (Ph 9) · Sharing and public collections (Ph 10) · Content creation (Ph 10) · Collaboration (Ph 10) · PDF, video, podcast, post adapters (Ph 6–10) · Native apps (Ph 8+).

## The eight weeks

| Weeks | Focus | Exit criterion |
|---|---|---|
| **1–2** | **Foundation.** Retire the workforce surface. Turn on type checking. Schema, RLS, pg-boss, worker container, graby sidecar, R2. Hardened fetcher. | A URL can be saved and extracted end to end, with real status, in a test |
| **3–4** | **Capture and library.** Extension, save flow, grid + list, filters, reader, cursor pagination. | A user can save, browse and read. Dogfoodable. |
| **5** | **Import.** Pocket, Instapaper, Raindrop. Batched, low-priority, live progress. | 3,000 items import without starving live saves |
| **6** | **Understanding.** The one structured call. Prompt caching, batch API for imports, cost ledger. **Topic shelves.** | ★ Wow moment #1 works on a real imported library |
| **7** | **Search.** Chunking, embeddings, hybrid RRF, matched spans, facets, zero-result fallback. | ★ Wow moment #2 — the golden retrieval set passes |
| **8** | **Harden and launch.** Security pass, onboarding flow, empty states, the Day-1 email, quotas, instrumentation. | 20 external users complete the Day 0 journey |

**Weeks 1–2 are the risk.** They contain retiring the existing product surface, turning on type checking (which will surface real errors — Phase 2 §5), and standing up two new deployment targets. If that slips, week 5 slips, and import is the thing that cannot be cut. **Protect weeks 1–2 above all else.**

## What we deliberately accept shipping without

| Accepted gap | Honest cost |
|---|---|
| No JS-rendered page support | Some SPA articles fail. **We show the real reason and a Retry**, not a blank card. Acceptable. |
| No PDFs | Loses the Researcher persona in v1. Deliberate (§2.9) — she deserves an excellent first impression, not a partial one. |
| Desktop only | Loses phone capture, the highest-volume save context. **The most costly gap**, and the reason mobile is first in the weeks 9–12 queue. |
| No highlights | Loses the strongest engagement signal for eight weeks of measurement. |
| No Ask | Loses the trust moment. Mitigated: the summary and citations groundwork still lands in week 6. |
| Three tiers of extraction, not four | Slightly lower extraction success rate than Wallabag's ceiling. Measured per domain from day one. |

## Success criteria at week 8

Not vanity metrics — the hypotheses from Phase 2 §26:

| Metric | Target | Proves |
|---|---|---|
| Day 0 completion (import + search + extension) | **>50%** of signups | Onboarding works |
| Extraction success rate | **>90%** across the top 50 domains | The foundation is sound |
| Save → card visible | **<200ms** p95 | Capture is frictionless |
| Search p95 | **<200ms** | Retrieval is instant |
| Week-1 retention | **>40%** | The wow moments landed |
| **Retrieval of items >7d old** | **>30%** of weekly actives | ★ **The hypothesis that matters** |
| Cost per saved object | **known and stable** | Unit economics are a design input, not a later crisis |

## The ruthless summary

> **Eight weeks buys: save → understand → find. It does not buy: engage, listen, ask, share.**
>
> That is a coherent, honest product. A user can bring three thousand articles, watch them organise themselves, and find something by meaning that they could not have found by keyword. That proves the premise.
>
> Weeks 9–16 add depth — ask, highlight, mobile. **Nothing in the eight-week build has to be rebuilt to add them** (Phase 2 §26), which is the only test an MVP scope has to pass.

---

# 19. WHAT I WOULD PUSH BACK ON

Three things in this specification are genuine bets rather than analysis, stated plainly rather than buried:

**1. Cutting Ask-This-Article from the eight weeks may be wrong.** It is the trust moment, it is architecturally cheap (the chunks are already in hand — one call, Phase 2 §11), and *"ask any article a question"* is a far more legible pitch than *"semantic search."* If week 6 lands early, this is the first thing to pull forward — ahead of mobile.

**2. Desktop-only for eight weeks is the largest accepted risk.** People encounter links on their phone. A capture product without phone capture is measuring a habit it has made artificially hard to form, which means the week-1 retention number will read lower than the product deserves. It is the right cut for eight weeks and it will distort the data; interpret week-8 retention with that in mind.

**3. The free tier is generous to a degree that will hurt.** Full semantic search and unlimited shelves on 100 free items is a real AI cost per non-paying user. I believe it is correct — a free user who never sees the magic never converts, and gating the differentiator is how you build a product nobody talks about. But it must be watched from week one, which is why the cost ledger is in the eight-week build and not deferred to the billing phase.

---

*End of Phase 3. No code, no components, no database, no migrations, no APIs, no frontend files. Product strategy, UX architecture, user journeys and MVP definition only. Stopping here.*
