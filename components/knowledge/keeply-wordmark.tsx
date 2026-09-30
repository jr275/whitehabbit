import { cn } from "@/lib/utils"

export function KeeplyWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif text-2xl font-semibold leading-none tracking-tight text-foreground", className)}>
      KEEP<span className="text-primary">ly</span>
    </span>
  )
}
