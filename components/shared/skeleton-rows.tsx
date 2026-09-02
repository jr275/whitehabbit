/* ================================================================== *
 * SKELETON ROWS — the one shared loading primitive this codebase was
 * missing (every page before this used ad hoc "Loading…" text). A
 * quiet pulse, matching the existing hairline-bordered visual language
 * (components/studio/primitives.tsx's Section) rather than a new
 * skeleton system — never a spinner, never a layout shift once real
 * content arrives (same row height as a Metric/table row).
 * ================================================================== */

export function SkeletonRows({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-secondary/60" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  )
}

/** A grid of stat-tile-shaped skeletons — for Overview's summary strip
 * and any other Metric/StatTile row while its real fetch is in flight. */
export function SkeletonTiles({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-secondary/40" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  )
}
