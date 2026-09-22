/* ================================================================== *
 * REGISTRATION PARITY — the server registries and the client catalog.
 *
 * lib/workforce/catalog.ts is metadata the browser bundle can import;
 * the two lib/agent registries are the code that actually runs. Studio
 * reads the first and the runtime executes the second, so a mismatch
 * is not a cosmetic bug: it is a skill an operator can pick and the
 * runtime cannot run, or a tool a skill requires and no worker can be
 * given.
 *
 * Nothing here is Tavily-specific by design — these assertions hold
 * for every entry, so the next skill added inherits the check.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { SKILL_REGISTRY, getSkill } from "@/lib/agent/skills/registry"
import { TOOL_REGISTRY, getTool } from "@/lib/agent/tools/registry"
import { SKILL_CATALOG, TOOL_CATALOG } from "@/lib/workforce/catalog"
import { OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { titleFor } from "@/lib/agent/runtime"

describe("the new capability is actually registered", () => {
  it("skill_objective_research runs on the server and appears in the catalog", () => {
    assert.ok(getSkill("skill_objective_research"), "not in the server skill registry")
    assert.ok(
      SKILL_CATALOG.some((s) => s.id === "skill_objective_research"),
      "not in the client catalog",
    )
  })

  it("tool_tavily_search runs on the server and appears in the catalog", () => {
    assert.ok(getTool("tool_tavily_search"), "not in the server tool registry")
    assert.ok(
      TOOL_CATALOG.some((t) => t.id === "tool_tavily_search"),
      "not in the client catalog",
    )
  })

  it("did not displace the keyless web search tool", () => {
    // tool_web_search is the only search this environment's egress
    // policy can actually reach; adding Tavily must not remove it.
    assert.ok(getTool("tool_web_search"))
    assert.ok(getSkill("skill_trend_research"))
  })
})

describe("parity, for every entry", () => {
  it("every catalog skill has a real executable behind it, with matching metadata", () => {
    for (const template of SKILL_CATALOG) {
      const skill = getSkill(template.id)
      assert.ok(skill, `${template.id} is offered in Studio but has no server implementation`)
      assert.equal(skill.name, template.name, `${template.id}: name drift`)
      assert.equal(skill.outputType, template.outputType, `${template.id}: outputType drift`)
      assert.deepEqual(skill.requiredTools, template.requiredTools, `${template.id}: requiredTools drift`)
      assert.deepEqual(
        skill.inputs.map((i) => i.key),
        template.inputs.map((i) => i.key),
        `${template.id}: input keys drift`,
      )
    }
    assert.equal(SKILL_CATALOG.length, SKILL_REGISTRY.length, "the catalog and the registry list different skills")
  })

  it("every tool a registered skill requires actually exists", () => {
    for (const skill of SKILL_REGISTRY) {
      for (const toolId of skill.requiredTools) {
        assert.ok(getTool(toolId), `${skill.id} requires ${toolId}, which is not registered`)
      }
    }
  })

  it("every skill's outputType has presentation metadata", () => {
    // The gap this closes: a skill can be registered, executable and
    // catalogued, and still land in the Outputs Hub as an untitled
    // row filed under "Other" — because OUTPUT_TYPE_META is a
    // Record<string, ...>, so a missing entry is not a type error.
    // It is a silent presentation failure, and this is the check that
    // makes it a loud one.
    for (const skill of SKILL_REGISTRY) {
      assert.ok(OUTPUT_TYPE_META[skill.outputType], `${skill.id} produces "${skill.outputType}", which has no OUTPUT_TYPE_META entry`)
    }
  })

  it("every catalog tool has a real implementation, and ids are unique", () => {
    for (const template of TOOL_CATALOG) {
      assert.ok(getTool(template.id), `${template.id} is offered but not implemented`)
    }
    assert.equal(TOOL_CATALOG.length, TOOL_REGISTRY.length)
    assert.equal(new Set(TOOL_REGISTRY.map((t) => t.id)).size, TOOL_REGISTRY.length)
    assert.equal(new Set(SKILL_REGISTRY.map((s) => s.id)).size, SKILL_REGISTRY.length)
  })
})

/* ================================================================== *
 * OUTPUT TITLING — lib/agent/runtime.ts
 *
 * The title is the whole of what an operator sees in the Outputs Hub
 * list. A skill whose every output is called "Result" is registered
 * but not usable, which is a different failure from a broken skill and
 * an easier one to ship without noticing.
 * ================================================================== */

describe("output titles", () => {
  it("titles a research result from its own input key, not another skill's", () => {
    // objective-research takes `objective`; trend-research takes
    // `query`. A shared guess would have titled every research output
    // "Research result" forever.
    assert.equal(titleFor("research_result", { objective: "Which pricing models B2B SaaS is moving to" }), "Research — Which pricing models B2B SaaS is moving to")
    assert.equal(titleFor("research_result", { query: "wrong key" }), "Research result", "must not silently borrow another skill's input key")
    assert.equal(titleFor("research_result", {}), "Research result")
  })

  it("keeps a title short enough to be a row, cutting at a word boundary", () => {
    const long = "Which pricing models are B2B SaaS companies moving to in 2026 and what is driving the shift away from per-seat billing"
    const title = titleFor("research_result", { objective: long })

    assert.ok(title.length < 80, `title is ${title.length} chars: ${title}`)
    assert.ok(title.endsWith("…"))
    assert.ok(!title.includes("  "))
    assert.ok(!/\s…$/.test(title), "the ellipsis must not follow a dangling space")
  })

  it("still titles every existing output type the way it did before", () => {
    assert.equal(titleFor("trend_report", { query: "AI agents" }), "Trend report — AI agents")
    assert.equal(titleFor("trend_report", {}), "Trend report")
    assert.equal(titleFor("content_analysis", {}), "Content performance analysis")
    assert.equal(titleFor("engagement_analysis", {}), "Engagement analysis")
    assert.equal(titleFor("something_unknown", {}), "Result")
  })
})
