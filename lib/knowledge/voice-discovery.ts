/* ================================================================== *
 * VOICE DISCOVERY — getting the list, which is not as simple as
 * calling getVoices().
 *
 * THE PROBLEM THIS EXISTS FOR. speechSynthesis.getVoices() is
 * specified to return the available voices, and on Chrome/Linux it
 * does, immediately. On Safari — macOS and iOS both — the first call
 * routinely returns an EMPTY ARRAY, and the real list arrives
 * asynchronously, announced by a `voiceschanged` event. Code that
 * calls getVoices() once at startup and believes the answer will
 * therefore never name a voice on Safari, and every article will be
 * read by whatever default the engine picks for the utterance's lang.
 *
 * So discovery is: read what is there now, AND listen for the list
 * arriving later. Neither alone is enough — some engines never fire
 * voiceschanged because the list was complete from the first call,
 * and others fire it several times as engines register.
 *
 * WHAT THIS IS NOT. It is not a cache with a refresh policy, and it
 * does not poll. getVoices() is cheap and the browser owns the list;
 * this holds the latest answer and a single listener, nothing more.
 *
 * LIFECYCLE IS THE OTHER HALF. One listener per instance, removed on
 * dispose(), and no subscriber notified after dispose() — the three
 * things that otherwise turn a React remount into a leak.
 * ================================================================== */

import type { SpeechSynthesisVoiceLike } from "./voice-selection"

/** The part of speechSynthesis this module touches. Narrow on purpose
 *  — and every member optional except getVoices, because engines vary
 *  in what they expose and a missing addEventListener must degrade,
 *  not throw. */
export interface VoiceSourceLike {
  getVoices(): SpeechSynthesisVoiceLike[]
  addEventListener?: (type: "voiceschanged", listener: () => void) => void
  removeEventListener?: (type: "voiceschanged", listener: () => void) => void
  /** The older, pre-addEventListener form. Safari has supported the
   *  modern one for years; this is kept because assigning it costs one
   *  line and losing voice discovery costs the feature. */
  onvoiceschanged?: (() => void) | null
}

export type VoicesListener = (voices: SpeechSynthesisVoiceLike[]) => void

/**
 * Holds the current voice list and keeps it current.
 *
 * Construct one per owner (the Read Aloud hook owns one), call
 * getVoices() whenever a voice is actually needed, and dispose() when
 * the owner goes away.
 */
export class VoiceDiscovery {
  private source: VoiceSourceLike | undefined
  private voices: SpeechSynthesisVoiceLike[] = []
  private listeners = new Set<VoicesListener>()
  private disposed = false
  /** Kept so removeEventListener gets the SAME reference it was given
   *  — passing a fresh closure removes nothing and leaks the old one. */
  private readonly onVoicesChanged = () => this.refresh()
  private attached = false

  constructor(source?: VoiceSourceLike) {
    this.source = source
    if (!source) return

    // Read what is already there. On Chrome this is usually the whole
    // list and voiceschanged may never fire at all.
    this.refresh()

    // And listen for it arriving later, which is the Safari path.
    if (typeof source.addEventListener === "function") {
      try {
        source.addEventListener("voiceschanged", this.onVoicesChanged)
        this.attached = true
      } catch {
        /* an engine that refuses the listener still has whatever
         * refresh() already read */
      }
    } else if ("onvoiceschanged" in source) {
      try {
        source.onvoiceschanged = this.onVoicesChanged
        this.attached = true
      } catch {
        /* same */
      }
    }
  }

  /** True once a non-empty list has been seen. The UI uses this to
   *  tell "still arriving" from "this engine has none", which are
   *  different facts and must not share a message. */
  hasVoices(): boolean {
    return this.voices.length > 0
  }

  /** The latest known list. Never null; an empty array means the
   *  engine has not produced one (yet, or at all). */
  getVoices(): SpeechSynthesisVoiceLike[] {
    return this.voices
  }

  /**
   * Be told when the list changes.
   *
   * Returns its own unsubscribe. Subscribing after dispose() is a
   * no-op rather than an error: a React effect can tear down in an
   * order the caller does not control.
   */
  subscribe(listener: VoicesListener): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Re-read the engine. Called by the voiceschanged listener; public
   *  so a caller with its own reason to re-check can, without a second
   *  listener. */
  refresh(): void {
    if (this.disposed || !this.source) return
    let next: SpeechSynthesisVoiceLike[]
    try {
      next = this.source.getVoices() ?? []
    } catch {
      // An engine that throws here is one we cannot name a voice from.
      // That is a degraded feature, not a broken Reader.
      return
    }
    if (!Array.isArray(next)) return

    // Don't wake subscribers for an unchanged list. voiceschanged can
    // fire several times as engines register, and re-rendering the
    // Reader for an identical list is noise.
    if (sameVoices(this.voices, next)) return
    this.voices = next
    for (const listener of this.listeners) {
      try {
        listener(next)
      } catch {
        /* one bad subscriber must not stop the others */
      }
    }
  }

  /**
   * Release the listener and stop notifying.
   *
   * Idempotent, because a double-invoked effect cleanup (React Strict
   * Mode does exactly this in development) must not throw or remove
   * someone else's listener.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const source = this.source
    if (source && this.attached) {
      try {
        if (typeof source.removeEventListener === "function") {
          source.removeEventListener("voiceschanged", this.onVoicesChanged)
        } else if (source.onvoiceschanged === this.onVoicesChanged) {
          source.onvoiceschanged = null
        }
      } catch {
        /* nothing useful to do; the instance is inert from here */
      }
    }
    this.attached = false
    this.listeners.clear()
    this.source = undefined
  }
}

/** Identity by (lang, name) pairs in order — enough to tell a real
 *  change from a repeated announcement, without deep-comparing objects
 *  the engine may recreate on every call. */
function sameVoices(a: readonly SpeechSynthesisVoiceLike[], b: readonly SpeechSynthesisVoiceLike[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.lang !== b[i]?.lang || a[i]?.name !== b[i]?.name) return false
  }
  return true
}

/**
 * The browser's own speechSynthesis as a VoiceSourceLike, or undefined
 * where there is none — SSR, and any browser without the API.
 *
 * Mirrors getSpeechEngine() in read-aloud.ts, which is the one other
 * place that touches `window`. Both return undefined rather than
 * throwing, because "this environment has no speech" is a state the
 * Reader renders, not an error it reports.
 */
export function getVoiceSource(): VoiceSourceLike | undefined {
  if (typeof window === "undefined") return undefined
  const synth = (window as unknown as { speechSynthesis?: VoiceSourceLike }).speechSynthesis
  if (!synth || typeof synth.getVoices !== "function") return undefined
  return synth
}
