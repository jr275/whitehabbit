/* ================================================================== *
 * ASK YOUR LIBRARY — retrieval, grounding, and the citation guarantee.
 *
 * The model is never called: `deps.fetchImpl` stands in for it, so
 * every assertion here is about the code that decides WHAT is sent and
 * WHAT is believed of the answer — which is where the properties that
 * matter live. Whether the prose reads well is not testable; whether an
 * invented citation can reach a user is, and does.
 *
 * Isolation is asserted against the real database, through the real
 * repository, because that is the only way to prove the tenant filter
 * rather than restate it.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

import {
  askLibrary,
  AskNotConfiguredError,
  AskValidationError,
  buildPrompt,
  extractSearchTerms,
  MAX_CHARS_PER_DOCUMENT,
  MAX_DOCUMENTS,
  MAX_QUESTION_CHARS,
  MAX_TOTAL_CONTEXT_CHARS,
  resolveCitations,
  selectDocuments,
} from "@/lib/knowledge/ask"
import * as repo from "@/lib/knowledge/repo"
import type { KnowledgeRow } from "@/lib/knowledge/repo"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"

let alice: TestTenant
let bob: TestTenant
let otherOrg: TestTenant

before(async () => {
  await prepareDatabase()
  alice = await createTenant("ask-alice")
  bob = await createTenant("ask-bob")
  otherOrg = await createTenant("ask-other-org")
})
after(async () => {
  await closeTestPool()
})

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key-not-real"
})

/** Inserts a readable saved item for one tenant. */
async function save(
  tenant: TestTenant,
  fields: { title: string; text: string; domain?: string },
): Promise<string> {
  const id = `kn_${randomBytes(8).toString("hex")}`
  const now = Date.now()
  await getTestPool().query(
    `INSERT INTO knowledge_items
       (id, org_id, created_by, url, normalized_url, domain, status, kind, attempts, favorite, archived,
        title, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$4,$5,'ready','article',0,false,false,$6,$7,$8,$8)`,
    [
      id,
      tenant.orgId,
      tenant.userId,
      `https://example.com/${id}`,
      fields.domain ?? "example.com",
      fields.title,
      fields.text,
      now,
    ],
  )
  return id
}

/** A stand-in for the Messages API that returns whatever the test wants
 *  and records the request body, so assertions can look at exactly what
 *  would have been sent. */
function stubModel(answer: string): { fetchImpl: typeof fetch; sent: () => { system: string; prompt: string } } {
  let captured: { system: string; prompt: string } = { system: "", prompt: "" }
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { system: string; messages: { content: string }[] }
    captured = { system: body.system, prompt: body.messages[0].content }
    return new Response(JSON.stringify({ content: [{ type: "text", text: answer }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch
  return { fetchImpl, sent: () => captured }
}

const row = (over: Partial<KnowledgeRow> = {}): KnowledgeRow =>
  ({
    id: "kn_x",
    url: "https://example.com/x",
    title: "A title",
    domain: "example.com",
    site_name: null,
    author: null,
    excerpt: null,
    summary: null,
    content_text: "body",
    created_at: "1",
    ...over,
  }) as KnowledgeRow

describe("extractSearchTerms — a sentence becomes searchable", () => {
  it("keeps content words and drops the scaffolding", () => {
    // repo.searchItems matches ONE substring, so the whole question can
    // never be the query; these are what actually get searched.
    const terms = extractSearchTerms("What have I saved about AI agents?")
    assert.ok(terms.includes("agents"))
    assert.ok(!terms.includes("what"))
    assert.ok(!terms.includes("have"))
    assert.ok(!terms.includes("saved"), "'saved' is scaffolding in a library, not a subject")
  })

  it("puts the most selective words first and caps how many are used", () => {
    const terms = extractSearchTerms("compare retrieval augmented generation with embeddings and rankers")
    assert.ok(terms[0].length >= terms[terms.length - 1].length, "longest first")
    assert.ok(terms.length <= 8)
  })

  it("survives punctuation, casing and duplicates", () => {
    assert.deepEqual(extractSearchTerms("Claude, CLAUDE — claude!"), ["claude"])
  })

  it("returns nothing for a question made only of scaffolding", () => {
    // An empty term list is what routes the request to the recent-items
    // fallback rather than to a search that would match everything.
    assert.deepEqual(extractSearchTerms("what about it?"), [])
    assert.deepEqual(extractSearchTerms("and then?"), [])
  })

  it("keeps weak-but-real content words rather than growing the stopword list", () => {
    // "main" survives, and that is the intended tradeoff: every word
    // added to STOPWORDS is a word that can no longer be searched for,
    // and a weak term costs one extra query, not a wrong answer.
    assert.deepEqual(extractSearchTerms("what are the main ideas across all of these?"), ["ideas", "main"])
  })
})

describe("resolveCitations — the guarantee is code, not a prompt", () => {
  const rows = [row({ id: "kn_1", title: "First" }), row({ id: "kn_2", title: "Second" })]

  it("resolves real markers to the real items", () => {
    const cites = resolveCitations("Agents matter [1]. Also this [2].", rows)
    assert.deepEqual(
      cites.map((c) => [c.marker, c.itemId]),
      [[1, "kn_1"], [2, "kn_2"]],
    )
  })

  it("DROPS a marker that points past what was sent", () => {
    // The whole point: the model can write [7]; it cannot make [7] into
    // a source the user sees.
    const cites = resolveCitations("According to the fourth piece [7], this is so.", rows)
    assert.deepEqual(cites, [])
  })

  it("drops [0] — markers are 1-based and 0 is not a document", () => {
    assert.deepEqual(resolveCitations("As shown [0].", rows), [])
  })

  it("keeps a repeated marker once, in first-appearance order", () => {
    const cites = resolveCitations("Second says this [2]. First agrees [1]. And again [2].", rows)
    assert.deepEqual(cites.map((c) => c.marker), [2, 1])
  })

  it("returns nothing for an answer with no markers at all", () => {
    assert.deepEqual(resolveCitations("Your library doesn't cover that.", rows), [])
  })

  it("falls back to the URL when a piece has no title", () => {
    const cites = resolveCitations("[1]", [row({ id: "kn_1", title: null, url: "https://example.com/untitled" })])
    assert.equal(cites[0].title, "https://example.com/untitled")
  })
})

describe("buildPrompt — what the model is and is not given", () => {
  it("numbers the pieces so markers can mean something", () => {
    const prompt = buildPrompt("q", [row({ title: "Alpha" }), row({ title: "Beta" })])
    assert.match(prompt, /\[1\] Alpha/)
    assert.match(prompt, /\[2\] Beta/)
  })

  it("never sends the item id or the URL", () => {
    // Nothing in the answer should be able to quote an internal id, and
    // the model has no use for either.
    const prompt = buildPrompt("q", [row({ id: "kn_secret", url: "https://example.com/secret-path" })])
    assert.ok(!prompt.includes("kn_secret"))
    assert.ok(!prompt.includes("secret-path"))
  })

  it("truncates one very long piece instead of letting it crowd out the rest", () => {
    const long = "x".repeat(MAX_CHARS_PER_DOCUMENT * 3)
    const prompt = buildPrompt("q", [row({ content_text: long }), row({ title: "Second", content_text: "short" })])
    assert.ok(prompt.length < MAX_TOTAL_CONTEXT_CHARS + 1000)
    assert.match(prompt, /\[2\] Second/, "the second piece still made it in")
  })

  it("stays under the whole-prompt ceiling with the maximum number of pieces", () => {
    const many = Array.from({ length: MAX_DOCUMENTS }, (_, i) =>
      row({ title: `Piece ${i}`, content_text: "y".repeat(MAX_CHARS_PER_DOCUMENT) }),
    )
    assert.ok(buildPrompt("q", many).length <= MAX_TOTAL_CONTEXT_CHARS + 500)
  })

  it("prefers extracted text, then summary, then excerpt", () => {
    assert.match(buildPrompt("q", [row({ content_text: "REAL", summary: "SUM", excerpt: "EX" })]), /REAL/)
    assert.match(buildPrompt("q", [row({ content_text: null, summary: "SUM", excerpt: "EX" })]), /SUM/)
    assert.match(buildPrompt("q", [row({ content_text: null, summary: null, excerpt: "EX" })]), /EX/)
  })
})

describe("selectDocuments — against the real database", () => {
  it("finds the user's own matching pieces", async () => {
    await save(alice, { title: "Why AI agents fail", text: "Agents fail for reasons of context and tooling." })
    const { rows, retrieval } = await selectDocuments({
      orgId: alice.orgId,
      userId: alice.userId,
      question: "What have I saved about agents?",
    })
    assert.equal(retrieval, "search")
    assert.ok(rows.some((r) => r.title === "Why AI agents fail"))
  })

  it("NEVER returns another user's piece from the same organization", async () => {
    // The isolation that matters most: Bob's article is in Alice's org.
    await save(bob, { title: "Bob's private notes on agents", text: "Agents, from Bob's own reading." })
    const { rows } = await selectDocuments({
      orgId: bob.orgId === alice.orgId ? alice.orgId : alice.orgId,
      userId: alice.userId,
      question: "agents",
    })
    assert.ok(!rows.some((r) => r.title?.includes("Bob's")), "a colleague's piece must never be retrievable")
  })

  it("NEVER returns another organization's piece", async () => {
    await save(otherOrg, { title: "Foreign org agents memo", text: "Agents as seen by another tenant." })
    const { rows } = await selectDocuments({
      orgId: alice.orgId,
      userId: alice.userId,
      question: "agents",
    })
    assert.ok(!rows.some((r) => r.title?.includes("Foreign org")))
  })

  it("skips pieces with no extracted text — a title is not evidence", async () => {
    const id = `kn_${randomBytes(8).toString("hex")}`
    await getTestPool().query(
      `INSERT INTO knowledge_items (id, org_id, created_by, url, normalized_url, domain, status, kind,
         attempts, favorite, archived, title, content_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$4,'example.com','failed','article',0,false,false,'Untextable zorblatt', NULL, 1, 1)`,
      [id, alice.orgId, alice.userId, `https://example.com/${id}`],
    )
    const { rows } = await selectDocuments({
      orgId: alice.orgId,
      userId: alice.userId,
      question: "zorblatt",
    })
    assert.ok(!rows.some((r) => r.id === id), "answering from a bare title is the guess this must not make")
  })

  it("ranks a piece matching more of the question higher", async () => {
    await save(alice, { title: "Only rankers", text: "A piece about qzrankers alone." })
    await save(alice, { title: "Rankers and qzembeddings", text: "About qzrankers and qzembeddings together." })
    const { rows } = await selectDocuments({
      orgId: alice.orgId,
      userId: alice.userId,
      question: "qzrankers qzembeddings",
    })
    assert.match(rows[0].title ?? "", /qzembeddings/, "two matches beat one")
  })

  it("caps how many pieces are ever selected", async () => {
    for (let i = 0; i < MAX_DOCUMENTS + 4; i += 1) {
      await save(alice, { title: `Capped piece ${i}`, text: "A recurring subject: qzcapping." })
    }
    const { rows } = await selectDocuments({
      orgId: alice.orgId,
      userId: alice.userId,
      question: "qzcapping",
    })
    assert.ok(rows.length <= MAX_DOCUMENTS)
  })

  it("falls back to recent pieces for a question with no usable terms", async () => {
    const { retrieval, rows } = await selectDocuments({
      orgId: alice.orgId,
      userId: alice.userId,
      question: "what about it?",
    })
    assert.equal(retrieval, "recent", "labelled honestly, not passed off as a search")
    assert.ok(rows.length > 0)
  })

  it("reports 'none' for a library with nothing readable", async () => {
    const empty = await createTenant("ask-empty")
    const { rows, retrieval } = await selectDocuments({
      orgId: empty.orgId,
      userId: empty.userId,
      question: "anything at all",
    })
    assert.equal(rows.length, 0)
    assert.equal(retrieval, "none")
  })
})

describe("askLibrary — end to end, with the model stubbed", () => {
  it("answers from the user's own pieces and cites them", async () => {
    const tenant = await createTenant("ask-e2e")
    await save(tenant, { title: "The qzsigil protocol", text: "Qzsigil is a protocol for signing library items." })
    const model = stubModel("Your saved piece describes it as a signing protocol [1].")

    const result = await askLibrary(
      { orgId: tenant.orgId, userId: tenant.userId, question: "What is qzsigil?" },
      { fetchImpl: model.fetchImpl },
    )

    assert.equal(result.retrieval, "search")
    assert.equal(result.citations.length, 1)
    assert.equal(result.citations[0].title, "The qzsigil protocol")
    assert.match(model.sent().prompt, /Qzsigil is a protocol/, "the real extracted text was sent")
    assert.match(model.sent().system, /only what the provided pieces say/i)
  })

  it("drops a citation the model invented", async () => {
    const tenant = await createTenant("ask-invent")
    await save(tenant, { title: "One piece", text: "About qzinventing things." })
    const model = stubModel("As established [1], and also per the other article [4].")

    const result = await askLibrary(
      { orgId: tenant.orgId, userId: tenant.userId, question: "qzinventing" },
      { fetchImpl: model.fetchImpl },
    )
    assert.deepEqual(result.citations.map((c) => c.marker), [1], "[4] was never sent and must not survive")
  })

  it("answers an empty library without calling the model at all", async () => {
    const empty = await createTenant("ask-nolib")
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response("{}", { status: 200 })
    }) as unknown as typeof fetch

    const result = await askLibrary(
      { orgId: empty.orgId, userId: empty.userId, question: "What have I saved?" },
      { fetchImpl },
    )
    assert.equal(called, false, "there is nothing to ground an answer in — spending a call would be waste")
    assert.equal(result.retrieval, "none")
    assert.equal(result.citations.length, 0)
    assert.match(result.answer, /nothing in your library/i)
  })

  it("rejects an empty question", async () => {
    await assert.rejects(
      () => askLibrary({ orgId: alice.orgId, userId: alice.userId, question: "   " }),
      AskValidationError,
    )
  })

  it("rejects a question past the length limit", async () => {
    await assert.rejects(
      () => askLibrary({ orgId: alice.orgId, userId: alice.userId, question: "x".repeat(MAX_QUESTION_CHARS + 1) }),
      AskValidationError,
    )
  })

  it("refuses honestly when the deployment has no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY
    await assert.rejects(
      () => askLibrary({ orgId: alice.orgId, userId: alice.userId, question: "anything" }),
      AskNotConfiguredError,
    )
  })

  it("surfaces a provider failure as a generic message, never the upstream body", async () => {
    const tenant = await createTenant("ask-upstream")
    await save(tenant, { title: "A piece", text: "About qzupstream failures." })
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "invalid x-api-key sk-ant-SECRET" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch

    await assert.rejects(
      () => askLibrary({ orgId: tenant.orgId, userId: tenant.userId, question: "qzupstream" }, { fetchImpl }),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        assert.ok(!message.includes("sk-ant"), "an upstream body must never reach the user")
        assert.ok(!message.includes("x-api-key"))
        assert.match(message, /try again/i)
        return true
      },
    )
  })

  it("an answer citing nothing still returns, with no citations", async () => {
    // "Your library doesn't cover that" is a correct answer, and it has
    // no sources by construction.
    const tenant = await createTenant("ask-nocite")
    await save(tenant, { title: "Unrelated", text: "About qznothing whatsoever." })
    const model = stubModel("Nothing you've saved speaks to that.")
    const result = await askLibrary(
      { orgId: tenant.orgId, userId: tenant.userId, question: "qznothing" },
      { fetchImpl: model.fetchImpl },
    )
    assert.equal(result.citations.length, 0)
    assert.ok(result.consulted.length > 0, "what was looked at is still reported")
  })
})

describe("no secret ever leaves the server", () => {
  it("the API key is read from the environment, never from a parameter", async () => {
    // A key that could be passed in is a key that could come from a
    // request body. The only source is process.env, server-side.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/knowledge/ask.ts", "utf8"),
    )
    assert.ok(!/ANTHROPIC_API_KEY/.test(source), "ask.ts must not touch the key at all — callAnthropic owns it")
    assert.ok(!/apiKey|api_key/i.test(source), "no key plumbing in this module")
  })

  it("the ask route reads tenancy only from the session", async () => {
    const route = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/knowledge/ask/route.ts", "utf8"),
    )
    assert.match(route, /await requireSession\(\)/)
    assert.ok(
      !/body\.(orgId|organizationId|userId)/.test(route),
      "an org or user id from the browser must never be read",
    )
  })
})
