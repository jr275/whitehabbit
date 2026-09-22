/* ================================================================== *
 * OBJECTIVE RESEARCH SKILL — lib/agent/skills/objective-research.ts
 *
 *   Objective -> Tavily -> real web sources -> LLM -> research result
 *
 * Both ends of that pipeline are stubbed here as ToolDefinitions, which
 * is the same seam the runtime uses: the skill only ever sees the tools
 * on ctx.tools, so a fake tool exercises the real code path rather than
 * a parallel one. No network, no credential, no cost.
 *
 * The claim under test is the one the whole skill exists to make:
 * EVERY DISCOVERY POINTS AT A PAGE THAT WAS ACTUALLY RETRIEVED. A
 * model that cites source [9] out of five sources, or cites nothing at
 * all, must lose that discovery — not have it rendered next to real
 * ones, where a reader cannot tell the difference.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { objectiveResearchSkill, admissibleDiscoveries, buildPrompt, parseObjective, parseResearch } from "@/lib/agent/skills/objective-research"
import type { ObjectiveResearchPayload } from "@/lib/agent/skills/objective-research"
import { SkillBlockedError } from "@/lib/agent/types"
import type { SkillExecutionContext, SourceRecord, ToolActionResult, ToolDefinition } from "@/lib/agent/types"

/* ---- fixtures ------------------------------------------------------ */

const OBJECTIVE = "Which pricing models are B2B SaaS companies moving to, and why"

const SOURCES: SourceRecord[] = [
  { title: "Usage-based pricing in 2026", url: "https://example.test/a", provider: "tavily", snippet: "Vendors moved off pure seat pricing." },
  { title: "Hybrid pricing survey", url: "https://example.test/b", provider: "tavily", snippet: "62% now blend seats and usage." },
  { title: "Seat pricing retrospective", url: "https://example.test/c", provider: "tavily", snippet: "Seats still dominate renewals." },
]

const LLM_OK = JSON.stringify({
  answer:
    "B2B SaaS pricing is shifting from pure per-seat toward hybrid models that pair a seat floor with usage. The stated driver is that AI features consume variable compute, so seats no longer track cost. Seat pricing has not disappeared; it still anchors renewals.",
  discoveries: [
    { title: "Hybrid is the new default", finding: "Most vendors surveyed now blend a seat floor with metered usage rather than choosing one.", importance: 1, source_indices: [1, 0] },
    { title: "Seats still anchor renewals", finding: "Renewal negotiations continue to be framed per seat even where billing is metered.", importance: 2, source_indices: [2] },
  ],
})

/* ---- tool doubles -------------------------------------------------- */

function fakeTool(id: string, name: string, actionId: string, result: ToolActionResult<unknown>, seen: unknown[]): ToolDefinition {
  return {
    id,
    name,
    provider: "test",
    description: "test double",
    isConnected: () => true,
    actions: [
      {
        id: actionId,
        label: "Run",
        permission: "read",
        riskLevel: "low",
        run: async (input: unknown) => {
          seen.push(input)
          return result
        },
      },
    ],
  }
}

interface Harness {
  ctx: SkillExecutionContext
  searchInputs: unknown[]
  llmInputs: unknown[]
  events: { type: string; payload: Record<string, unknown> }[]
}

function harness(options: {
  objective?: string
  search?: ToolActionResult<unknown>
  llm?: ToolActionResult<unknown>
  omit?: "search" | "llm"
}): Harness {
  const searchInputs: unknown[] = []
  const llmInputs: unknown[] = []
  const events: { type: string; payload: Record<string, unknown> }[] = []

  const searchResult: ToolActionResult<unknown> = options.search ?? {
    ok: true,
    data: { results: SOURCES, provider: "Tavily (api.tavily.com)" },
    durationMs: 12,
  }
  const llmResult: ToolActionResult<unknown> = options.llm ?? {
    ok: true,
    data: { text: LLM_OK, model: "gemini-fixture", inputTokens: 900, outputTokens: 140, provider: "gemini" },
    durationMs: 34,
  }

  const tools = new Map<string, ToolDefinition>()
  if (options.omit !== "search") tools.set("tool_tavily_search", fakeTool("tool_tavily_search", "Tavily Search", "search", searchResult, searchInputs))
  if (options.omit !== "llm") tools.set("tool_llm", fakeTool("tool_llm", "LLM", "analyze", llmResult, llmInputs))

  const ctx: SkillExecutionContext = {
    workerId: "worker_1",
    executionId: "exec_1",
    taskId: "task_1",
    input: { objective: options.objective ?? OBJECTIVE },
    tools,
    worker: { mission: "", objectives: [], behaviors: [], knowledge: [] },
    emit: (type, payload) => events.push({ type, payload }),
  }
  return { ctx, searchInputs, llmInputs, events }
}

/* ---- 1. objective validation --------------------------------------- */

describe("the objective", () => {
  it("accepts a real objective and normalizes its whitespace", () => {
    assert.equal(parseObjective("  What   changed\n\nin pricing  "), "What changed in pricing")
  })

  it("refuses an empty or trivial objective before anything is spent", async () => {
    for (const bad of ["", "   ", "why", "pricing"]) {
      await assert.rejects(
        () => objectiveResearchSkill.execute(harness({ objective: bad }).ctx),
        /at least 10 characters/,
        `accepted: ${JSON.stringify(bad)}`,
      )
    }
  })

  it("spends no search request on a rejected objective", async () => {
    // The bug this prevents: validating after the tool call, so an
    // empty textarea still bills a search and a model.
    const h = harness({ objective: "" })
    await assert.rejects(() => objectiveResearchSkill.execute(h.ctx))
    assert.equal(h.searchInputs.length, 0)
    assert.equal(h.llmInputs.length, 0)
  })

  it("refuses an objective longer than the stated maximum", async () => {
    await assert.rejects(() => objectiveResearchSkill.execute(harness({ objective: "a".repeat(1001) }).ctx), /at most 1000 characters/)
  })
})

/* ---- 2. the search leg --------------------------------------------- */

describe("the Tavily leg", () => {
  it("searches for the objective itself and asks for a real result count", async () => {
    const h = harness({})
    await objectiveResearchSkill.execute(h.ctx)

    assert.equal(h.searchInputs.length, 1)
    const input = h.searchInputs[0] as { query: string; limit: number }
    assert.equal(input.query, OBJECTIVE)
    assert.ok(input.limit > 0)
  })

  it("blocks — rather than answering — when the tool is not registered", async () => {
    await assert.rejects(() => objectiveResearchSkill.execute(harness({ omit: "search" }).ctx), SkillBlockedError)
  })

  it("blocks when Tavily has no credential, and never calls the model", async () => {
    const h = harness({ search: { ok: false, blocked: true, blockedReason: "Configure TAVILY_API_KEY for this deployment.", durationMs: 1 } })
    await assert.rejects(() => objectiveResearchSkill.execute(h.ctx), (err: Error) => {
      assert.ok(err instanceof SkillBlockedError)
      assert.match(err.message, /TAVILY_API_KEY/)
      return true
    })
    assert.equal(h.llmInputs.length, 0, "a blocked search must not be followed by a model call")
  })

  it("surfaces a Tavily API error as a provider failure, never as an empty result", async () => {
    const h = harness({ search: { ok: false, errorCode: "provider_error", error: "Tavily search returned 429: Rate limit exceeded", durationMs: 5 } })
    await assert.rejects(() => objectiveResearchSkill.execute(h.ctx), /429/)
    assert.equal(h.llmInputs.length, 0)
  })

  it("surfaces a rejected Tavily key as an invalid credential, not an outage", async () => {
    const h = harness({ search: { ok: false, errorCode: "invalid_credential", error: "Tavily rejected the configured API key (401): Unauthorized", durationMs: 5 } })
    await assert.rejects(() => objectiveResearchSkill.execute(h.ctx), { name: "InvalidCredentialError" })
  })

  it("stops when there are no sources rather than letting the model answer from itself", async () => {
    // Without this the skill would hand the model an empty source list
    // and return whatever it recalled — the exact failure the whole
    // grounding design exists to prevent.
    const h = harness({ search: { ok: true, data: { results: [], provider: "Tavily" }, durationMs: 3 } })
    await assert.rejects(() => objectiveResearchSkill.execute(h.ctx), /no sources/)
    assert.equal(h.llmInputs.length, 0)
  })
})

/* ---- 3. the synthesis leg ------------------------------------------ */

describe("the LLM leg", () => {
  it("sends the model every retrieved source, numbered and with its URL", async () => {
    const h = harness({})
    await objectiveResearchSkill.execute(h.ctx)

    const { system, prompt } = h.llmInputs[0] as { system: string; prompt: string }
    assert.match(system, /Never invent a source/)
    // Grounding is enforced in code for discoveries; for the ANSWER
    // prose the prompt is the only lever, so these two instructions
    // are part of the contract rather than incidental wording.
    assert.match(system, /Separate evidence from inference/)
    assert.match(system, /evidence is thin/)
    for (const [i, s] of SOURCES.entries()) {
      assert.ok(prompt.includes(`[${i}]`), `source ${i} is not numbered in the prompt`)
      assert.ok(prompt.includes(s.url), `source ${i}'s URL is missing from the prompt`)
      assert.ok(prompt.includes(s.snippet!), `source ${i}'s content is missing from the prompt`)
    }
    assert.ok(prompt.includes(OBJECTIVE))
  })

  it("returns the model's real identity and token counts, not defaults", async () => {
    const result = await objectiveResearchSkill.execute(harness({}).ctx)
    assert.equal(result.model, "gemini-fixture")
    assert.equal(result.provider, "gemini")
    assert.equal(result.inputTokens, 900)
    assert.equal(result.outputTokens, 140)
  })

  it("blocks when no LLM is registered or configured", async () => {
    await assert.rejects(() => objectiveResearchSkill.execute(harness({ omit: "llm" }).ctx), SkillBlockedError)
    await assert.rejects(
      () => objectiveResearchSkill.execute(harness({ llm: { ok: false, blocked: true, blockedReason: "Configure GEMINI_API_KEY.", durationMs: 1 } }).ctx),
      /GEMINI_API_KEY/,
    )
  })

  it("fails on malformed model output instead of returning a half-parsed result", async () => {
    for (const text of ["not json at all", "{}", '{"answer":"x"}', '{"discoveries":[]}', '{"answer": 5, "discoveries": []}']) {
      const h = harness({ llm: { ok: true, data: { text, model: "m", inputTokens: 1, outputTokens: 1, provider: "gemini" }, durationMs: 1 } })
      await assert.rejects(() => objectiveResearchSkill.execute(h.ctx), /not valid structured research data|contained no answer/, `accepted: ${text}`)
    }
  })

  it("accepts the markdown fence models wrap JSON in", () => {
    const parsed = parseResearch("```json\n" + LLM_OK + "\n```")
    assert.ok(parsed)
    assert.equal(parsed.discoveries.length, 2)
  })
})

/* ---- 4. grounding: the claim the skill exists to make --------------- */

describe("grounding", () => {
  it("keeps only discoveries whose citations resolve to a retrieved source", () => {
    const kept = admissibleDiscoveries(
      [
        { title: "Real", finding: "Cites source 1.", importance: 1, source_indices: [1] },
        { title: "Out of range", finding: "Cites a source that was never retrieved.", importance: 2, source_indices: [9] },
        { title: "Uncited", finding: "Cites nothing at all.", importance: 3, source_indices: [] },
        { title: "Missing field", finding: "", importance: 4, source_indices: [0] },
        { title: "Partly real", finding: "Cites one real and one invented index.", importance: 5, source_indices: [2, 42] },
      ],
      SOURCES.length,
    )

    assert.deepEqual(
      kept.map((d) => d.title),
      ["Real", "Partly real"],
    )
    assert.deepEqual(kept[1].source_indices, [2], "the invented index is stripped, the real one survives")
    assert.deepEqual(
      kept.map((d) => d.importance),
      [1, 2],
      "importance is renumbered contiguously so the reader never sees 1, 5",
    )
  })

  it("every index in a returned discovery addresses a real source", async () => {
    const result = await objectiveResearchSkill.execute(harness({}).ctx)
    const payload = result.structured as ObjectiveResearchPayload

    assert.ok(payload.discoveries.length > 0)
    for (const d of payload.discoveries) {
      assert.ok(d.source_indices.length > 0, "a discovery with no citation must not survive")
      for (const i of d.source_indices) {
        assert.ok(result.sources[i], `discovery "${d.title}" cites source ${i}, which does not exist`)
      }
    }
  })

  it("drops a fabricated citation end to end and keeps the answer honest", async () => {
    const fabricated = JSON.stringify({
      answer: "A synthesis.",
      discoveries: [
        { title: "Invented", finding: "According to a source that was never retrieved.", importance: 1, source_indices: [7] },
        { title: "Grounded", finding: "Actually supported by the second retrieved page.", importance: 2, source_indices: [1] },
      ],
    })
    const h = harness({ llm: { ok: true, data: { text: fabricated, model: "m", inputTokens: 1, outputTokens: 1, provider: "gemini" }, durationMs: 1 } })
    const result = await objectiveResearchSkill.execute(h.ctx)
    const payload = result.structured as ObjectiveResearchPayload

    assert.deepEqual(
      payload.discoveries.map((d) => d.title),
      ["Grounded"],
    )
    assert.ok(!result.summary.includes("Invented"), "a discarded discovery must not reach the rendered summary")
  })

  it("deduplicates repeated citations rather than double-counting coverage", () => {
    const kept = admissibleDiscoveries([{ title: "T", finding: "Repeats one index.", importance: 1, source_indices: [1, 1, 1] }], SOURCES.length)
    assert.deepEqual(kept[0].source_indices, [1])
  })
})

/* ---- 5. source preservation ---------------------------------------- */

describe("source preservation", () => {
  it("returns exactly the sources Tavily returned, unaltered and in order", async () => {
    const result = await objectiveResearchSkill.execute(harness({}).ctx)
    assert.deepEqual(result.sources, SOURCES, "the skill must not rewrite, reorder or supplement the retrieved sources")
  })

  it("renders each discovery against the title of the source it actually cites", async () => {
    const result = await objectiveResearchSkill.execute(harness({}).ctx)
    assert.ok(result.summary.includes("Hybrid pricing survey"))
    assert.ok(result.summary.includes("Seat pricing retrospective"))
  })

  it("numbers prompt sources by the same index the output cites", () => {
    const prompt = buildPrompt("obj", SOURCES)
    // The silent-corruption risk: prompt numbering drifting from the
    // array the indices are later resolved against, so every citation
    // points one source off and still "resolves".
    for (const [i, s] of SOURCES.entries()) {
      const block = prompt.slice(prompt.indexOf(`[${i}]`))
      assert.ok(block.startsWith(`[${i}] ${s.title}`), `index ${i} does not head its own source`)
      assert.ok(block.slice(0, 300).includes(s.url))
    }
  })
})

/* ---- 6. evaluation and metrics ------------------------------------- */

describe("evaluation", () => {
  it("scores from the real result, and never reports quality for nothing", async () => {
    const result = await objectiveResearchSkill.execute(harness({}).ctx)
    const evaluation = objectiveResearchSkill.evaluate(result)

    assert.ok(evaluation.qualityScore > 0 && evaluation.qualityScore <= 100)
    const coverage = evaluation.breakdown.find((b) => b.label === "Source coverage")
    assert.ok(coverage)
    assert.match(coverage.note, /3\/3 retrieved sources cited/)

    const empty = { ...result, structured: { objective: OBJECTIVE, answer: "", discoveries: [] } as ObjectiveResearchPayload }
    assert.equal(objectiveResearchSkill.evaluate(empty).qualityScore, 0)
  })

  it("emits only operational and quality metrics — no invented business number", async () => {
    const result = await objectiveResearchSkill.execute(harness({}).ctx)
    const metrics = objectiveResearchSkill.metrics(result, objectiveResearchSkill.evaluate(result))

    assert.deepEqual(
      metrics.map((m) => m.key),
      ["sources_retrieved", "discoveries_reported", "research_quality"],
    )
    assert.ok(metrics.every((m) => m.kind === "operational" || m.kind === "quality"))
    assert.equal(metrics[0].value, SOURCES.length)
  })
})
