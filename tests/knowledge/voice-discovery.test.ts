/* ================================================================== *
 * VOICE DISCOVERY — the late list, and the listener that must not
 * leak.
 *
 * THE BUG CLASS THIS GUARDS. On Safari (macOS and iOS) the first
 * getVoices() routinely returns []. Code that asks once and believes
 * the answer never names a voice there at all. Code that asks and
 * subscribes, but subscribes again on every render, accumulates
 * listeners until the page is closed. Both are silent: no error, no
 * log, just a feature that does nothing on one browser and a leak on
 * every other.
 *
 * So the two halves are tested separately and together: the list
 * arrives, AND exactly one listener exists, AND dispose() removes it.
 *
 * MUTATION-CHECKED, per AGENTS.md §8:
 *   - skip the constructor's refresh() → "uses voices that are
 *     already there" fails.
 *   - drop removeEventListener from dispose() → "removes its listener
 *     on dispose" fails.
 *   - notify subscribers for an unchanged list → "ignores a repeated
 *     announcement" fails.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { VoiceDiscovery, type VoiceSourceLike } from "@/lib/knowledge/voice-discovery"
import type { SpeechSynthesisVoiceLike } from "@/lib/knowledge/voice-selection"

const v = (lang: string, name: string): SpeechSynthesisVoiceLike => ({ lang, name })

/** A speechSynthesis stand-in whose list the test controls, and which
 *  records every listener add/remove so a leak is visible. */
class FakeSource implements VoiceSourceLike {
  private voices: SpeechSynthesisVoiceLike[]
  listeners: (() => void)[] = []
  addCalls = 0
  removeCalls = 0
  getVoicesCalls = 0

  constructor(initial: SpeechSynthesisVoiceLike[] = []) {
    this.voices = initial
  }
  getVoices() {
    this.getVoicesCalls += 1
    return this.voices
  }
  addEventListener(_type: "voiceschanged", listener: () => void) {
    this.addCalls += 1
    this.listeners.push(listener)
  }
  removeEventListener(_type: "voiceschanged", listener: () => void) {
    this.removeCalls += 1
    this.listeners = this.listeners.filter((l) => l !== listener)
  }
  /** The browser making the list available later. */
  announce(next: SpeechSynthesisVoiceLike[]) {
    this.voices = next
    for (const l of [...this.listeners]) l()
  }
}

/* ---- the list is already there -------------------------------------- */

describe("VoiceDiscovery — voices available at construction", () => {
  it("uses voices that are already there, without waiting for an event", () => {
    // The Chrome path: getVoices() is complete on the first call and
    // voiceschanged may never fire.
    const source = new FakeSource([v("pt-BR", "Brazilian")])
    const d = new VoiceDiscovery(source)
    assert.equal(d.hasVoices(), true)
    assert.deepEqual(d.getVoices().map((x) => x.name), ["Brazilian"])
    d.dispose()
  })

  it("subscribes exactly one listener", () => {
    const source = new FakeSource([v("en-US", "English")])
    const d = new VoiceDiscovery(source)
    assert.equal(source.addCalls, 1, "one instance, one listener")
    assert.equal(source.listeners.length, 1)
    d.dispose()
  })
})

/* ---- the list arrives late ------------------------------------------ */

describe("VoiceDiscovery — the Safari path", () => {
  it("starts empty when the first getVoices() returns nothing", () => {
    const d = new VoiceDiscovery(new FakeSource([]))
    assert.equal(d.hasVoices(), false)
    assert.deepEqual(d.getVoices(), [], "empty, not null — callers must not branch on nullness")
    d.dispose()
  })

  it("picks the list up when voiceschanged fires", () => {
    const source = new FakeSource([])
    const d = new VoiceDiscovery(source)
    assert.equal(d.hasVoices(), false)

    source.announce([v("pt-BR", "Brazilian"), v("en-US", "English")])

    assert.equal(d.hasVoices(), true)
    assert.deepEqual(d.getVoices().map((x) => x.lang), ["pt-BR", "en-US"])
    d.dispose()
  })

  it("handles several announcements, as engines register one by one", () => {
    const source = new FakeSource([])
    const d = new VoiceDiscovery(source)
    source.announce([v("en-US", "English")])
    source.announce([v("en-US", "English"), v("pt-BR", "Brazilian")])
    source.announce([v("en-US", "English"), v("pt-BR", "Brazilian"), v("es-ES", "Spanish")])
    assert.equal(d.getVoices().length, 3)
    assert.equal(source.addCalls, 1, "still one listener after three announcements")
    d.dispose()
  })

  it("notifies subscribers when the list changes", () => {
    const source = new FakeSource([])
    const d = new VoiceDiscovery(source)
    const seen: number[] = []
    d.subscribe((voices) => seen.push(voices.length))

    source.announce([v("pt-BR", "Brazilian")])
    source.announce([v("pt-BR", "Brazilian"), v("en-US", "English")])

    assert.deepEqual(seen, [1, 2])
    d.dispose()
  })

  it("ignores a repeated announcement of the same list", () => {
    // voiceschanged can fire several times with nothing new; waking
    // the Reader for an identical list is pure noise.
    const source = new FakeSource([])
    const d = new VoiceDiscovery(source)
    let notifications = 0
    d.subscribe(() => (notifications += 1))

    source.announce([v("pt-BR", "Brazilian")])
    source.announce([v("pt-BR", "Brazilian")])
    source.announce([v("pt-BR", "Brazilian")])

    assert.equal(notifications, 1, "only the real change counts")
    d.dispose()
  })
})

/* ---- lifecycle ------------------------------------------------------- */

describe("VoiceDiscovery — lifecycle", () => {
  it("removes its listener on dispose", () => {
    const source = new FakeSource([v("en-US", "English")])
    const d = new VoiceDiscovery(source)
    d.dispose()
    assert.equal(source.removeCalls, 1)
    assert.equal(source.listeners.length, 0, "nothing may outlive the owner")
  })

  it("notifies nobody after dispose", () => {
    const source = new FakeSource([])
    const d = new VoiceDiscovery(source)
    let notified = false
    d.subscribe(() => (notified = true))
    d.dispose()
    source.announce([v("pt-BR", "Brazilian")])
    assert.equal(notified, false, "a disposed instance must be inert")
  })

  it("is idempotent — React Strict Mode double-invokes cleanup", () => {
    const source = new FakeSource([v("en-US", "English")])
    const d = new VoiceDiscovery(source)
    d.dispose()
    assert.doesNotThrow(() => d.dispose())
    assert.equal(source.removeCalls, 1, "the second dispose must not remove someone else's listener")
  })

  it("unsubscribing one listener leaves the others", () => {
    const source = new FakeSource([])
    const d = new VoiceDiscovery(source)
    let a = 0
    let b = 0
    const offA = d.subscribe(() => (a += 1))
    d.subscribe(() => (b += 1))
    offA()
    source.announce([v("pt-BR", "Brazilian")])
    assert.equal(a, 0)
    assert.equal(b, 1)
    d.dispose()
  })

  it("subscribing after dispose is a no-op, not a throw", () => {
    const d = new VoiceDiscovery(new FakeSource([]))
    d.dispose()
    assert.doesNotThrow(() => d.subscribe(() => {}))
  })

  it("one throwing subscriber does not stop the others", () => {
    const source = new FakeSource([])
    const d = new VoiceDiscovery(source)
    let reached = false
    d.subscribe(() => {
      throw new Error("subscriber blew up")
    })
    d.subscribe(() => (reached = true))
    assert.doesNotThrow(() => source.announce([v("pt-BR", "Brazilian")]))
    assert.equal(reached, true)
    d.dispose()
  })
})

/* ---- degraded engines ------------------------------------------------ */

describe("VoiceDiscovery — engines that cannot answer", () => {
  it("works with no source at all", () => {
    // SSR, and any browser without the API.
    const d = new VoiceDiscovery(undefined)
    assert.equal(d.hasVoices(), false)
    assert.deepEqual(d.getVoices(), [])
    assert.doesNotThrow(() => d.refresh())
    assert.doesNotThrow(() => d.dispose())
  })

  it("survives a getVoices() that throws", () => {
    const source: VoiceSourceLike = {
      getVoices() {
        throw new Error("The operation is insecure.")
      },
      addEventListener() {},
      removeEventListener() {},
    }
    let d: VoiceDiscovery | null = null
    assert.doesNotThrow(() => {
      d = new VoiceDiscovery(source)
    })
    assert.deepEqual(d!.getVoices(), [], "a degraded feature, not a broken Reader")
    d!.dispose()
  })

  it("survives a getVoices() that returns something that is not an array", () => {
    const source = { getVoices: () => null } as unknown as VoiceSourceLike
    const d = new VoiceDiscovery(source)
    assert.deepEqual(d.getVoices(), [])
    d.dispose()
  })

  it("falls back to onvoiceschanged when addEventListener is absent", () => {
    const source: VoiceSourceLike = {
      voices: [] as SpeechSynthesisVoiceLike[],
      onvoiceschanged: null,
      getVoices() {
        return (this as unknown as { voices: SpeechSynthesisVoiceLike[] }).voices
      },
    } as unknown as VoiceSourceLike

    const d = new VoiceDiscovery(source)
    assert.equal(typeof source.onvoiceschanged, "function", "the older form must still be wired")
    ;(source as unknown as { voices: SpeechSynthesisVoiceLike[] }).voices = [v("pt-BR", "Brazilian")]
    source.onvoiceschanged?.()
    assert.equal(d.hasVoices(), true)

    d.dispose()
    assert.equal(source.onvoiceschanged, null, "and must be cleared on dispose")
  })

  it("does not attach a listener when the engine offers neither mechanism", () => {
    const source = { getVoices: () => [v("en-US", "English")] } as unknown as VoiceSourceLike
    const d = new VoiceDiscovery(source)
    assert.equal(d.hasVoices(), true, "what was already there is still usable")
    assert.doesNotThrow(() => d.dispose())
  })
})
