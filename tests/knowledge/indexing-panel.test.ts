/* ================================================================== *
 * THE PRODUCT MUST SAY WHAT IT KNOWS.
 *
 * An empty Connections page has three possible causes — nothing saved,
 * not read yet, or no model configured on this deployment — and they
 * look identical on screen. /api/knowledge/indexing has reported which
 * one it is since it was written, and had no caller. These cover the
 * screen that now asks it, and the two properties that make the answer
 * trustworthy: it reports the server's own counts, and it never
 * invents one.
 * ================================================================== */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const panel = readFileSync("components/knowledge/indexing-panel.tsx", "utf8")
const client = readFileSync("lib/knowledge/client.ts", "utf8")
const settings = readFileSync("components/knowledge/settings-view.tsx", "utf8")

describe("the indexing panel reads the real route", () => {
  it("calls the existing endpoint rather than a new one", () => {
    assert.match(client, /fetch\("\/api\/knowledge\/indexing"/)
    assert.doesNotMatch(panel, /fetch\(/, "components talk to the network through lib/knowledge/client only")
  })

  it("queues work without running it", () => {
    // The scheduled tick drains the queue. A component that ran jobs
    // itself would be a second worker racing the first.
    assert.match(client, /startBackfill/)
    assert.doesNotMatch(panel, /claimAndRunJob|drainJobs/)
  })

  it("is rendered only for a signed-in reader", () => {
    // A guest has no server-side library, so there is nothing to
    // report and the route would answer 401.
    assert.match(settings, /\{!isGuest && <IndexingPanel \/>\}/)
  })
})

describe("it reports, never estimates", () => {
  it("shows the deployment fault before any backlog number", () => {
    // When the provider is not configured nothing below will ever
    // finish, so a backlog count shown first would read as the problem
    // when it is only the symptom.
    const notice = panel.indexOf("isn&rsquo;t configured on this deployment")
    const facts = panel.indexOf("<Fact label=")
    assert.ok(notice > 0 && facts > 0, "both the notice and the facts should render")
    assert.ok(notice < facts, "the deployment fault must come first")
  })

  it("repeats the server's own outcome rather than a cheerful paraphrase", () => {
    // "Queued 40", "already queued" and "nothing to queue" are three
    // different facts and the person asked a question that deserves
    // whichever one is true.
    assert.match(panel, /result\.enqueued > 0/)
    assert.match(panel, /result\.alreadyQueued > 0/)
    assert.match(panel, /Nothing to queue/)
  })

  it("surfaces the model identity and never a credential", () => {
    assert.match(panel, /embedding\.model/)
    for (const secret of ["API_KEY", "apiKey", "GEMINI_API", "process.env"]) {
      assert.ok(!panel.includes(secret), `the panel must not reference ${secret}`)
    }
  })

  it("offers nothing to queue when there is no backlog", () => {
    // A button that queues zero items and reports success would teach
    // the reader the feature does nothing.
    assert.match(panel, /disabled=\{queueing \|\| pending === 0\}/)
  })
})
