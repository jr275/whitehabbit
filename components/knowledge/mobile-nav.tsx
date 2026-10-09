"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { MOBILE_NAV, isNavActive } from "@/lib/knowledge/config"

/* Four destinations, evenly weighted, quiet. The floating accent Save
 * button that used to sit in the middle of this bar was the single
 * loudest element on every phone screen, and it was the third copy of
 * an action already in the header. */
export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Knowledge navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--pk-rule)] bg-[var(--pk-ground)]/92 backdrop-blur-xl lg:hidden"
    >
      <div className="flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {MOBILE_NAV.map((item) => {
          const active = isNavActive(pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-16 flex-col items-center gap-1 rounded-[var(--pk-r-sm)] py-1.5",
                active ? "text-[var(--pk-ink)]" : "text-[var(--pk-ink-4)]",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={active ? 2.1 : 1.8} />
              <span className="pk-label text-[9px] text-current">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
