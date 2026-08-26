import { describe, expect, it } from "vitest"
import { classifyIntent } from "@/lib/intelligence/intent-classifier"

describe("classifyIntent (§17)", () => {
  it("classifies investment queries", () => {
    expect(classifyIntent("best neighborhoods for rental yield").intent).toBe("investment")
    expect(classifyIntent("how to invest in real estate").intent).toBe("investment")
  })

  it("classifies comparison queries", () => {
    expect(classifyIntent("apartment vs house").intent).toBe("comparison")
    expect(classifyIntent("which is better, renting or buying").intent).toBe("comparison")
  })

  it("classifies how_to and definition queries distinctly", () => {
    expect(classifyIntent("how to buy an apartment").intent).toBe("how_to")
    expect(classifyIntent("what is a condominium fee").intent).toBe("definition")
  })

  it("classifies transactional and local queries", () => {
    expect(classifyIntent("apartments for sale in Rio de Janeiro").intent).toBe("transactional")
    expect(classifyIntent("real estate agencies near me").intent).toBe("local")
  })

  it("never fabricates a confident label for an unrecognized query — falls back to low-confidence informational", () => {
    const result = classifyIntent("xyzzy plugh")
    expect(result.intent).toBe("informational")
    expect(result.confidence).toBeLessThan(0.5)
    expect(result.matchedPattern).toBeNull()
  })

  it("is deterministic — same input always produces the same output", () => {
    const a = classifyIntent("apartments barra da tijuca")
    const b = classifyIntent("apartments barra da tijuca")
    expect(a).toEqual(b)
  })
})
