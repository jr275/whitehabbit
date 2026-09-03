#!/usr/bin/env node
/* ==================================================================
 * SMOKE SUITE — does the whole product still work?
 *
 * WHY THIS EXISTS. Milestone 1 shipped with one acceptance criterion
 * unmet: nothing proved that the Workforce/Studio product still worked
 * end to end after the Knowledge Library was added alongside it. Every
 * other check we have is a unit or repository test — they prove the
 * pieces are right, and prove nothing about the wired-up application.
 * M2 touches shared surface (proxy.ts, the root layout, the module
 * resolution the worker shares with tests), so that gap closes here.
 *
 * WHAT IT CHECKS, against a REAL running build and a REAL database:
 *
 *   SECURITY HEADERS   every HTML document carries the CSP, and every
 *                      <script> on it carries a nonce that matches the
 *                      header. This is not decoration: a prerendered
 *                      page silently ships scripts with NO nonce, and
 *                      under 'strict-dynamic' that means a page that
 *                      loads and then does nothing. Only a real
 *                      response can catch it.
 *   WORKFORCE          LOGIN -> STUDIO -> CREATE -> BUILD -> RUN(test)
 *                      -> RELEASE -> RUN(release)
 *   KNOWLEDGE          the SSRF guard, live and with no test escape
 *                      hatch; a page we could not read still being a
 *                      visible, openable item; and — where the machine
 *                      running this has egress — SAVE -> LIBRARY ->
 *                      READ and re-extraction from the archive.
 *   ISOLATION          a second account cannot see the first's data.
 *
 * NOT part of `npm test`, deliberately: this needs a built app, a
 * server and a database, and a unit suite that needs those is a unit
 * suite people stop running. Run it before a release, and in CI after
 * the build step.
 *
 *   npm run build && npm run smoke
 *
 * The LLM runs through the deterministic development fixture
 * (LLM_DEV_MODE), so a smoke run costs nothing and cannot fail because
 * a provider was slow. Everything else is real.
 * ================================================================== */

import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3123"
const START_SERVER = !process.env.SMOKE_BASE_URL

let passed = 0
const failures = []

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1
    process.stdout.write(`  ok   ${name}\n`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
    process.stdout.write(`  FAIL ${name}${detail ? ` — ${detail}` : ""}\n`)
  }
}

function section(title) {
  process.stdout.write(`\n${title}\n`)
}

/* ---- a cookie jar, because a session is the point ----------------- */

const jar = new Map()

function rememberCookies(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";")
    const index = pair.indexOf("=")
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
}

async function request(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), ...(jar.size > 0 ? { cookie: cookieHeader() } : {}) },
  })
  rememberCookies(res)
  return res
}

const json = async (res) => {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { __unparsed: text.slice(0, 300) }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---- the server under test ---------------------------------------- */

let child = null
let blobDir = ""

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: "manual" })
      if (res.status < 500) return true
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  return false
}

async function startServer() {
  const port = new URL(BASE).port

  // A server left over from an interrupted run will answer on this
  // port against a DIFFERENT database, and the suite would then test
  // that one and report nonsense. Refuse rather than guess.
  try {
    await fetch(`${BASE}/login`, { redirect: "manual", signal: AbortSignal.timeout(1_500) })
    throw new Error(
      `something is already listening on ${BASE}. Stop it, or point SMOKE_BASE_URL at the server you want tested.`,
    )
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("something is already listening")) throw err
    /* nothing there — good */
  }

  blobDir = await mkdtemp(join(tmpdir(), "wh-smoke-blobs-"))
  child = spawn("npx", ["next", "start", "-p", port, "-H", "127.0.0.1"], {
    env: {
      ...process.env,
      // Preview, not production: this is what makes the deterministic
      // LLM fixture reachable (lib/runtime-mode.ts hard-blocks it in
      // production, whatever LLM_DEV_MODE says).
      VERCEL_ENV: "preview",
      LLM_DEV_MODE: "true",
      AUTH_SECRET: process.env.AUTH_SECRET ?? `smoke-${randomUUID()}${randomUUID()}`,
      AUTH_TRUST_HOST: "true",
      // Pinned, not inherited. Auth.js reads AUTH_URL on EVERY request
      // (proxy.ts wraps the whole matcher), and its only guard is
      // falsiness — `if (!url) return req` — so a value like
      // "whitehabbit.vercel.app" from a deploy env reaches `new URL()`
      // bare and throws ERR_INVALID_URL. Every document then 500s, and
      // waitForServer, which only accepts status < 500, reports the
      // server as unreachable: a config leak that reads as a dead
      // build. It must be THIS server's origin regardless.
      AUTH_URL: BASE,
      KNOWLEDGE_BLOB_DIR: blobDir,
      KNOWLEDGE_TICK_SECRET: `smoke-tick-${randomUUID()}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", () => {})
  child.stderr.on("data", (d) => process.stderr.write(`  [server] ${d}`))

  if (!(await waitForServer())) throw new Error("the server never became reachable")
}

async function stopServer() {
  if (child) {
    child.kill("SIGTERM")
    await sleep(500)
    if (!child.killed) child.kill("SIGKILL")
  }
  if (blobDir) await rm(blobDir, { recursive: true, force: true })
}

/* ---- a publisher to save from ------------------------------------- */

const ARTICLE_HTML = `<!doctype html><html lang="en"><head>
<title>Smoke Test Article | Example Engineering</title>
<meta property="og:site_name" content="Example Engineering">
<meta name="author" content="Ada Lovelace">
<meta property="article:published_time" content="2026-03-14T09:00:00Z">
<link rel="canonical" href="__CANONICAL__">
</head><body>
<nav><a href="/">Home</a><a href="/jobs">Jobs</a></nav>
<article>
<h1>Smoke Test Article</h1>
<p>Most retrieval failures are chunking failures rather than model failures, and the distinction matters because the two have completely different fixes that teams routinely confuse.</p>
<p>The second pattern is an embedding model mismatched to the domain, invisible in evaluation and obvious in production once real queries arrive from real users.</p>
<p>The third is a ranking stage tuned on a corpus nobody has looked at since, quietly rewarding documents for being long rather than for being right.</p>
<script>window.smokeEvil = 1</script>
</article>
<footer><p>Copyright Example</p></footer></body></html>`

let publisher = null
let publisherOrigin = ""

async function startPublisher() {
  publisher = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(ARTICLE_HTML.replace("__CANONICAL__", `${publisherOrigin}${req.url}`))
  })
  await new Promise((resolve) => publisher.listen(0, "127.0.0.1", resolve))
  publisherOrigin = `http://127.0.0.1:${publisher.address().port}`
  return publisherOrigin
}

/* ---- checks -------------------------------------------------------- */

/**
 * Every script on a document must carry the nonce the header names.
 *
 * The failure this exists to catch is silent: a prerendered page ships
 * scripts with no nonce at all, the CSP blocks every one of them, and
 * the page looks fine to curl while being completely inert in a
 * browser.
 */
async function checkSecurityHeaders(path, { expectHtml = true } = {}) {
  const res = await request(path)
  const csp = res.headers.get("content-security-policy") ?? ""

  check(`${path} sends a CSP`, csp.length > 0)
  check(`${path} forbids plugins and framing`, csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'"))
  check(`${path} pins the document base`, csp.includes("base-uri 'self'"))
  check(`${path} sends nosniff`, res.headers.get("x-content-type-options") === "nosniff")
  check(`${path} sends a referrer policy`, (res.headers.get("referrer-policy") ?? "").length > 0)

  if (!expectHtml) return res

  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? ""
  check(`${path} CSP carries a nonce`, nonce.length > 0)

  const body = await res.text()
  const scripts = body.match(/<script[^>]*>/g) ?? []
  const unnonced = scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`))
  check(
    `${path} every <script> carries the nonce`,
    scripts.length > 0 && unnonced.length === 0,
    `${scripts.length} scripts, ${unnonced.length} without the nonce${unnonced[0] ? `: ${unnonced[0]}` : ""}`,
  )
  return res
}

async function signUp(email, password) {
  const res = await request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, organizationName: `${email} org` }),
  })
  return { status: res.status, body: await json(res) }
}

async function signIn(email, password) {
  const csrf = (await json(await request("/api/auth/csrf"))).csrfToken
  const form = new URLSearchParams({
    csrfToken: csrf,
    email,
    password,
    callbackUrl: `${BASE}/studio`,
    redirect: "false",
  })
  const res = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  })
  return res.status
}

/** Drain a newline-delimited execution stream into its events. */
async function readEvents(res) {
  const text = await res.text()
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { type: "unparsed", line }
      }
    })
}

async function main() {
  if (START_SERVER) {
    process.stdout.write("starting the built app...\n")
    await startServer()
  }
  const origin = await startPublisher()

  /* ---------------------------------------------------------------- */
  section("SECURITY HEADERS (signed out)")
  await checkSecurityHeaders("/login")

  /* ---------------------------------------------------------------- */
  section("AUTH")
  const email = `smoke-${randomUUID().slice(0, 8)}@example.test`
  const password = "smoke-password-1"

  const registered = await signUp(email, password)
  check("registers an account", registered.status === 200, `status ${registered.status}`)

  const gated = await request("/studio")
  check("signed-out /studio redirects to login", gated.status === 307 || gated.status === 302, `status ${gated.status}`)

  check("signs in", (await signIn(email, password)) === 302)
  const session = await json(await request("/api/auth/session"))
  check("the session names the workspace", Boolean(session.organizationId), JSON.stringify(session).slice(0, 120))

  /* ---------------------------------------------------------------- */
  section("SECURITY HEADERS (signed in)")
  await checkSecurityHeaders("/studio")
  await checkSecurityHeaders("/knowledge")

  /* ---------------------------------------------------------------- */
  section("WORKFORCE: create -> build -> test -> release -> run")

  const created = await json(
    await request("/api/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blueprint: {
          name: "Smoke Worker",
          role: "Research analyst",
          description: "Created by the smoke suite.",
          mission: "Prove the Workforce product still works end to end.",
          primarySkillId: "skill_trend_research",
          secondarySkillIds: [],
          primaryKPI: "Runs completed",
          secondaryKPIs: [],
        },
      }),
    }),
  )
  const workerId = created.worker?.id
  check("CREATE returns a worker", Boolean(workerId), JSON.stringify(created).slice(0, 200))

  const listed = await json(await request("/api/workers"))
  check(
    "STUDIO lists the new worker",
    Array.isArray(listed.workers) && listed.workers.some((w) => w.id === workerId),
  )

  const built = await json(await request(`/api/workers/${workerId}/build`, { method: "POST" }))
  check("BUILD produces a version", Boolean(built.version?.id), JSON.stringify(built).slice(0, 200))

  // RELEASE must refuse before a real test run — "tested" is a
  // server-verified fact, not a client-settable flag.
  const prematureRelease = await request(`/api/workers/${workerId}/release`, { method: "POST" })
  check("RELEASE refuses an untested worker", prematureRelease.status >= 400, `status ${prematureRelease.status}`)

  const testRun = await request(`/api/workers/${workerId}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill_trend_research", mode: "test", input: { topic: "retrieval systems" } }),
  })
  const testEvents = await readEvents(testRun)
  const testCompleted = testEvents.some((e) => e.type === "task_completed")
  check(
    "RUN (test) completes",
    testCompleted,
    testCompleted ? "" : JSON.stringify(testEvents.slice(-2)).slice(0, 300),
  )

  const released = await json(await request(`/api/workers/${workerId}/release`, { method: "POST" }))
  check("RELEASE succeeds once tested", Boolean(released.version?.id), JSON.stringify(released).slice(0, 200))

  const liveRun = await request(`/api/workers/${workerId}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill_trend_research", mode: "release", input: { topic: "retrieval systems" } }),
  })
  const liveEvents = await readEvents(liveRun)
  check(
    "RUN (release) completes",
    liveEvents.some((e) => e.type === "task_completed"),
    JSON.stringify(liveEvents.slice(-2)).slice(0, 300),
  )

  /* ---------------------------------------------------------------- */
  section("KNOWLEDGE: the SSRF guard, live")

  // The guard has NO test escape hatch, deliberately: a flag that let
  // the smoke suite reach a private address would be a flag an
  // attacker could look for. So the first thing the suite proves is
  // that the guard is actually running in the built app — a stub
  // publisher on loopback is exactly what an SSRF attempt looks like.
  const loopbackUrl = `${origin}/smoke-${randomUUID().slice(0, 8)}`
  const blockedSave = await json(
    await request("/api/knowledge/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: loopbackUrl }),
    }),
  )
  const blockedId = blockedSave.item?.id
  check("SAVE accepts the request and does the work asynchronously", Boolean(blockedId), JSON.stringify(blockedSave).slice(0, 200))

  let blockedItem = null
  for (let i = 0; i < 40 && blockedId; i += 1) {
    blockedItem = (await json(await request(`/api/knowledge/items/${blockedId}`))).item
    if (blockedItem?.status === "completed" || blockedItem?.status === "failed") break
    await sleep(250)
  }
  check(
    "the SSRF guard refuses a loopback address in the built app",
    blockedItem?.status === "failed" && blockedItem?.failureCode === "blocked_by_ssrf_guard",
    `status ${blockedItem?.status} / ${blockedItem?.failureCode}`,
  )
  check(
    "the refusal is explained in plain language, with no internals",
    typeof blockedItem?.failureMessage === "string" &&
      blockedItem.failureMessage.length > 0 &&
      !/127\.0\.0\.1|ECONN|stack/i.test(blockedItem.failureMessage),
    String(blockedItem?.failureMessage),
  )

  // M1's promise: a page we could not read is still a saved, visible,
  // openable item — never a silent hole in the library.
  const blockedLibrary = await json(await request("/api/knowledge/items"))
  check("a failed item still appears in the library", (blockedLibrary.items ?? []).some((i) => i.id === blockedId))
  const blockedReader = await request(`/knowledge/read/${blockedId}`)
  check("a failed item still opens", blockedReader.status === 200, `status ${blockedReader.status}`)

  // Nothing was fetched, so nothing was archived, so there is nothing
  // to re-read — and the API says so plainly rather than queueing work
  // that could only fail.
  const nothingToReextract = await request(`/api/knowledge/items/${blockedId}/reextract`, { method: "POST" })
  check(
    "RE-EXTRACT declines an item with no archived copy",
    nothingToReextract.status === 409,
    `status ${nothingToReextract.status}`,
  )

  /* ---------------------------------------------------------------- */
  section("KNOWLEDGE: save -> process -> library -> read")

  // Needs a REAL, publicly reachable article, because the SSRF guard
  // correctly refuses everything this machine could serve to itself.
  // Where there is no egress — CI sandboxes, this one included — the
  // section is skipped rather than faked: the same path is covered
  // against a real database in `npm test` (tests/knowledge/*), and a
  // check that quietly passes without running is worse than one that
  // says it did not run.
  const articleUrl = process.env.SMOKE_ARTICLE_URL
  if (!articleUrl) {
    process.stdout.write(
      "  skip  set SMOKE_ARTICLE_URL to a public article to exercise save -> read end to end\n",
    )
  } else {
    const saved = await json(
      await request("/api/knowledge/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: articleUrl }),
      }),
    )
    const itemId = saved.item?.id
    check("SAVE creates an item", Boolean(itemId), JSON.stringify(saved).slice(0, 200))

    let item = null
    for (let i = 0; i < 60 && itemId; i += 1) {
      item = (await json(await request(`/api/knowledge/items/${itemId}`))).item
      if (item?.status === "completed" || item?.status === "failed") break
      await sleep(250)
    }
    check("the item reaches completed", item?.status === "completed", `status ${item?.status} ${item?.failureCode ?? ""}`)
    check("something was extracted", Boolean(item?.title), String(item?.title))

    const library = await json(await request("/api/knowledge/items"))
    check("LIBRARY lists the item", (library.items ?? []).some((i) => i.id === itemId))

    const reader = await request(`/knowledge/read/${itemId}`)
    const readerHtml = await reader.text()
    check("READ renders the article", reader.status === 200 && readerHtml.length > 1000)
    check("no <script> survived into the reader", !/<script(?![^>]*nonce=)/i.test(readerHtml))

    // M2: the original bytes were archived, so this is re-readable
    // without touching the publisher again.
    const reextract = await request(`/api/knowledge/items/${itemId}/reextract`, { method: "POST" })
    const reextractBody = await json(reextract)
    check(
      "RE-EXTRACT is accepted, so the original bytes were archived",
      reextract.status === 202,
      `status ${reextract.status} ${JSON.stringify(reextractBody).slice(0, 200)}`,
    )

    let stillGood = false
    for (let i = 0; i < 20; i += 1) {
      const after = await request(`/knowledge/read/${itemId}`)
      stillGood = after.status === 200 && (await after.text()).length > 1000
      if (!stillGood) break
      await sleep(150)
    }
    check("the article survives re-extraction intact", stillGood)
  }

  /* ---------------------------------------------------------------- */
  section("TENANT ISOLATION")

  jar.clear()
  const otherEmail = `smoke-other-${randomUUID().slice(0, 8)}@example.test`
  await signUp(otherEmail, password)
  await signIn(otherEmail, password)

  const foreignItem = await request(`/api/knowledge/items/${blockedId}`)
  check("another account cannot read the item", foreignItem.status === 404, `status ${foreignItem.status}`)

  const foreignReextract = await request(`/api/knowledge/items/${blockedId}/reextract`, { method: "POST" })
  check("another account cannot re-extract it", foreignReextract.status === 404, `status ${foreignReextract.status}`)

  const foreignWorker = await request(`/api/workers/${workerId}`)
  check("another account cannot read the worker", foreignWorker.status === 404, `status ${foreignWorker.status}`)

  const foreignLibrary = await json(await request("/api/knowledge/items"))
  check("another account's library is empty", (foreignLibrary.items ?? []).length === 0)
}

try {
  await main()
} catch (err) {
  failures.push(`the suite threw: ${err instanceof Error ? err.stack : String(err)}`)
} finally {
  publisher?.close()
  if (START_SERVER) await stopServer()
}

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length > 0) {
  for (const failure of failures) process.stdout.write(`  - ${failure}\n`)
  process.exit(1)
}
process.exit(0)
