/* ================================================================== *
 * LISTEN — a source-level guard, honestly labelled.
 *
 * The playback state machine itself is already covered, thoroughly, by
 * tests/knowledge/read-aloud.test.ts — this surface adds no speech
 * logic, and duplicating those assertions here would only create a
 * second place to keep in step.
 *
 * What IS worth pinning is the thing this surface could get wrong: a
 * second speechSynthesis implementation. Two controllers over one
 * global speech queue produce overlapping narration that no unit test
 * of either one would catch, and the failure only shows up with a
 * human listening.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const AUDIO = readFileSync("components/knowledge/audio-view.tsx", "utf8")
const READER = readFileSync("components/knowledge/reader-view.tsx", "utf8")
const PARAGRAPHS = readFileSync("lib/knowledge/paragraphs.ts", "utf8")
const PAGE = readFileSync("app/knowledge/audio/page.tsx", "utf8")

describe("there is exactly one speechSynthesis implementation", () => {
  it("only read-aloud.ts touches the browser speech API", () => {
    // The controller is the one place allowed to reach for it. Anything
    // else calling speechSynthesis directly is a second implementation
    // by definition, whatever it is named.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(path)
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          // Comments are stripped first: this guards what the code
          // CALLS, not what the prose mentions. A file explaining why
          // it does not implement speech would otherwise fail it.
          const source = readFileSync(path, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^[ \t]*\/\/.*$/gm, "")
          if (/\bspeechSynthesis\b|\bSpeechSynthesisUtterance\b/.test(source)) offenders.push(path)
        }
      }
    }
    walk("lib/knowledge")
    walk("components/knowledge")

    // read-aloud.ts owns it; use-read-aloud.ts names it only in types.
    const allowed = new Set(["lib/knowledge/read-aloud.ts", "lib/knowledge/use-read-aloud.ts"])
    for (const path of offenders) {
      assert.ok(allowed.has(path), `${path} reaches for speechSynthesis directly — reuse useReadAloud instead`)
    }
  })

  it("the Audio surface drives playback through the shared hook", () => {
    assert.match(AUDIO, /useReadAloud\(/, "Audio must reuse the existing controller")
    assert.match(AUDIO, /from "@\/lib\/knowledge\/use-read-aloud"/)
  })

  it("the Reader still drives playback through the same hook", () => {
    // The refactor must not have moved the Reader onto anything else.
    assert.match(READER, /useReadAloud\(doc\.id, body\)/)
  })
})

describe("paragraph splitting is shared, not copied", () => {
  it("both surfaces use the one splitter", () => {
    assert.match(READER, /from "@\/lib\/knowledge\/paragraphs"/)
    assert.match(AUDIO, /from "@\/lib\/knowledge\/paragraphs"/)
  })

  it("neither re-implements the split", () => {
    // Two splitters would let the Reader and the player disagree about
    // where a paragraph ends — and the queue index is per-paragraph.
    for (const [name, source] of [["reader-view", READER], ["audio-view", AUDIO]] as const) {
      assert.ok(!/\.split\(\/\\n\{1,\}\//.test(source), `${name} must not split body text itself`)
    }
    assert.match(PARAGRAPHS, /export function toParagraphs/)
  })
})

describe("the page is a real surface, not a placeholder", () => {
  it("renders the Audio view", () => {
    assert.match(PAGE, /<AudioView \/>/)
  })

  it("carries no placeholder copy anywhere on the surface", () => {
    for (const [name, source] of [["page", PAGE], ["audio-view", AUDIO]] as const) {
      assert.ok(!/ComingSoon/.test(source), `${name} still renders the placeholder`)
      assert.ok(!/Not available yet|coming soon/i.test(source), `${name} still claims to be unavailable`)
    }
  })
})

describe("content and its honest failure", () => {
  it("reads the item's real extracted text", () => {
    assert.match(AUDIO, /doc\.contentText/, "playback must come from the stored text")
  })

  it("says so when a piece has no text, instead of narrating the title", () => {
    // A title read aloud is not audio of the article — it is a worse
    // failure than saying nothing, because it sounds like it worked.
    assert.match(AUDIO, /No extracted text to read/)
    assert.match(AUDIO, /body\.length === 0/)
    assert.ok(!/doc\.title\]/.test(AUDIO), "the title is never fed to the speech queue")
  })

  it("disables the play control when there is nothing to play", () => {
    assert.match(AUDIO, /disabled=\{body\.length === 0 \|\| read\.state === "unsupported"\}/)
  })
})

describe("auth and tenancy", () => {
  it("reads the library through the authenticated client, never the guest store", () => {
    assert.match(AUDIO, /fetchLibrary|fetchDocument/)
    assert.ok(!/guest-store/.test(AUDIO), "Audio must not read the browser-local library")
  })

  it("shows the sign-in state rather than silently falling back", () => {
    assert.match(AUDIO, /AuthRequiredError/)
    assert.match(AUDIO, /auth_required/)
    assert.match(AUDIO, /promptSignIn/)
  })
})
