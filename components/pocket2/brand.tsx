/* ================================================================== *
 * BRAND MARK — original artwork drawn for Pocket2.io.
 *
 * A folded page turning into a pocket: two strokes meeting at a
 * crease. Deliberately geometric and monoline so it reads at 16px in
 * a browser tab and at 64px on the landing page, and inherits
 * currentColor so it works on paper and on ink without a second file.
 * ================================================================== */

export function BrandMark({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={className}
      fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      {/* the pocket: an open container, wider than it is deep */}
      <path d="M3.25 7.5a2.25 2.25 0 0 1 2.25-2.25h13a2.25 2.25 0 0 1 2.25 2.25v5.75a8.75 8.75 0 0 1-17.5 0V7.5Z" />
      {/* the crease: a page folding down into it */}
      <path d="M8.5 10.25 12 13.5l3.5-3.25" />
    </svg>
  )
}

export function BrandLockup({ className = "", size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark size={size} />
      <span
        className="font-medium tracking-tight"
        style={{ fontSize: size * 0.82, letterSpacing: "-0.022em" }}
      >
        Pocket2
        <span style={{ color: "var(--p2-faint)", fontWeight: 400 }}>.io</span>
      </span>
    </span>
  )
}
