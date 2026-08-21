/* ================================================================== *
 * WORKER EVENT BUS + STREAM ABSTRACTION
 *
 * The runtime emits ExecutionEvents; the UI (fabric, result panel,
 * trace, metrics) subscribes. ONE event updates every projection.
 *
 * The RuntimeEventStream interface (connect / disconnect / subscribe /
 * unsubscribe) is deliberately transport-agnostic so the in-memory
 * bus can later be swapped for SSE, WebSockets, or a remote agent
 * backend without touching the UI.
 * ================================================================== */

import type { ExecutionEvent } from "./worker-model"

export type EventListener = (event: ExecutionEvent) => void

export class WorkerEventBus {
  private listeners = new Set<EventListener>()

  emit(event: ExecutionEvent) {
    // copy to a local array so unsubscribing mid-dispatch is safe
    for (const l of Array.from(this.listeners)) {
      try {
        l(event)
      } catch (err) {
        console.log("[v0] event listener error", err)
      }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.unsubscribe(listener)
  }

  unsubscribe(listener: EventListener) {
    this.listeners.delete(listener)
  }

  clear() {
    this.listeners.clear()
  }
}

/* Transport-agnostic stream. Today it wraps the in-memory bus; later a
 * SseEventStream / SocketEventStream can implement the same shape. */
export interface RuntimeEventStream {
  connect(): void
  disconnect(): void
  subscribe(listener: EventListener): () => void
  unsubscribe(listener: EventListener): void
}

export class LocalEventStream implements RuntimeEventStream {
  private connected = false
  constructor(private bus: WorkerEventBus) {}

  connect() {
    this.connected = true
  }

  disconnect() {
    this.connected = false
  }

  subscribe(listener: EventListener) {
    const wrapped: EventListener = (e) => {
      if (this.connected) listener(e)
    }
    return this.bus.subscribe(wrapped)
  }

  unsubscribe() {
    // handled by the disposer returned from subscribe
  }
}

let idCounter = 0
export function nextEventId(): string {
  idCounter += 1
  return `ev_${Date.now().toString(36)}_${idCounter}`
}

/* Shared singleton bus for the running prototype. */
export const workerBus = new WorkerEventBus()
export const workerStream = new LocalEventStream(workerBus)
workerStream.connect()
