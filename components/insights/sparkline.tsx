/* Sparkline suave com preenchimento de gradiente — igual aos cards de referência. */

interface Props {
  points: number[]
  className?: string
  strokeClass?: string
}

export function Sparkline({ points, className, strokeClass = "text-primary" }: Props) {
  const w = 120
  const h = 40
  const max = Math.max(...points, 0.0001)
  const step = w / (points.length - 1)
  const coords = points.map((p, i) => [i * step, h - (p / max) * (h - 6) - 3])

  // caminho suavizado (Catmull-Rom -> Bézier)
  let d = `M ${coords[0][0]},${coords[0][1]}`
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[Math.max(0, i - 1)]
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[i + 1]
    const [x3, y3] = coords[Math.min(coords.length - 1, i + 2)]
    const c1x = x1 + (x2 - x0) / 6
    const c1y = y1 + (y2 - y0) / 6
    const c2x = x2 - (x3 - x1) / 6
    const c2y = y2 - (y3 - y1) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`
  }
  const fill = `${d} L ${w},${h} L 0,${h} Z`
  const gid = `spark-${points.join("-").slice(0, 12)}`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} className={strokeClass} fill={`url(#${gid})`} stroke="none" />
      <path
        d={d}
        className={strokeClass}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
