/* The shared masthead. Every Keeply index page opens the same way — a
 * mono label, a large tight headline, one quiet line of context — so
 * that four surfaces written at four different times still read as one
 * product. Restyling this file is what carried Settings, Research,
 * Coming Soon and the guest Topics view into the new language without
 * touching any of them. */

interface PageHeaderProps {
  eyebrow: string
  title: string
  subtitle?: string
}

export function PageHeader({ eyebrow, title, subtitle }: PageHeaderProps) {
  return (
    <header className="pt-14 sm:pt-20">
      <p className="pk-label">{eyebrow}</p>
      <h1 className="pk-display mt-4 max-w-[18ch] text-[var(--pk-ink)]">{title}</h1>
      {subtitle && (
        <p className="mt-5 max-w-[54ch] text-pretty text-[15px] leading-[1.65] text-[var(--pk-ink-3)]">{subtitle}</p>
      )}
    </header>
  )
}

export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="pk-page pb-24">{children}</div>
}
