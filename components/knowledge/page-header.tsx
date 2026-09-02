interface PageHeaderProps {
  eyebrow: string
  title: string
  subtitle?: string
}

export function PageHeader({ eyebrow, title, subtitle }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h1 className="text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl">
        {title}
      </h1>
      {subtitle && (
        <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">{subtitle}</p>
      )}
    </header>
  )
}

export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">{children}</div>
}
