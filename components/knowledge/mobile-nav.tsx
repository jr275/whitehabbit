"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { MOBILE_NAV, isNavActive } from "@/lib/knowledge/config"

export function MobileNav({ onOpenSave }: { onOpenSave: () => void }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Knowledge navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--kn-edge)] bg-[var(--background)]/90 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {MOBILE_NAV.slice(0, 2).map((item) => (
          <NavButton key={item.href} item={item} active={isNavActive(pathname, item.href)} />
        ))}

        <button
          onClick={onOpenSave}
          aria-label="Save"
          className="flex size-12 -translate-y-1 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-90"
        >
          <Plus className="size-6" strokeWidth={2.5} />
        </button>

        {MOBILE_NAV.slice(2).map((item) => (
          <NavButton key={item.href} item={item} active={isNavActive(pathname, item.href)} />
        ))}
      </div>
    </nav>
  )
}

function NavButton({
  item,
  active,
}: {
  item: (typeof MOBILE_NAV)[number]
  active: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-16 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-medium transition-colors",
        active ? "text-[var(--kn-ai)]" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {item.label}
    </Link>
  )
}
