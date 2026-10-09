"use client"

/* An empty library is the first thing a new person sees, so it sets
 * the product's register. It used to be a bordered, shadowed card with
 * a 64px icon in a tinted rounded square and a centred accent pill —
 * the standard SaaS "nothing here yet" panel. Nothing in it was wrong;
 * it was just louder than the product it introduces. */

export function EmptyLibrary({ onSave }: { onSave: () => void }) {
  return (
    <div className="max-w-[46ch] py-10">
      <h2 className="pk-title text-balance text-[var(--pk-ink)]">Your library starts here.</h2>
      <p className="mt-4 text-pretty text-[15px] leading-[1.65] text-[var(--pk-ink-3)]">
        Save something from the web and it will appear here — readable, searchable, and connected to everything else
        you keep.
      </p>
      <button
        onClick={onSave}
        className="mt-7 flex h-10 items-center gap-1.5 rounded-full bg-[var(--pk-accent)] px-5 text-[13.5px] font-medium text-[var(--pk-accent-ink)] transition-opacity hover:opacity-90"
      >
        Save a link
      </button>
    </div>
  )
}
