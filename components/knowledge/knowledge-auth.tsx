"use client"

/* ================================================================== *
 * KNOWLEDGE AUTH — the UI half of lib/knowledge/auth-state.ts.
 *
 * One provider watches next-auth's session, resolves it into the three
 * states the product actually has, and publishes the answer both to
 * React (through context) and to the non-React client module, which
 * needs it inside a catch block.
 *
 * It deliberately does NOT implement any authentication. Sign-in is
 * next-auth's `signIn()` against the providers already configured in
 * lib/auth.ts; the Google button is the same components/auth one the
 * /login page uses, so there is exactly one Google flow in the
 * codebase and no second login system to keep in step.
 * ================================================================== */

import { LogIn, X } from "lucide-react"
import { signIn, useSession } from "next-auth/react"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { GoogleButton } from "@/components/auth/google-button"
import {
  decideAuthState,
  forgetSignedIn,
  hasEverSignedIn,
  publishAuthState,
  rememberSignedIn,
  type KnowledgeAuthState,
} from "@/lib/knowledge/auth-state"

interface KnowledgeAuthValue {
  state: KnowledgeAuthState
  email: string
  name: string
  /** Opens the sign-in dialog. Everything that needs a session routes
   *  through this rather than linking to /login, so the user never
   *  loses the page they were on. */
  promptSignIn: () => void
  /** Clears the "has signed in here" marker, then hands off to
   *  next-auth. Order matters: forgetting first means the next visit
   *  is an honest guest instead of being told a session expired. */
  signOutOfKnowledge: () => void
}

const KnowledgeAuthContext = createContext<KnowledgeAuthValue | null>(null)

export function useKnowledgeAuth(): KnowledgeAuthValue {
  const value = useContext(KnowledgeAuthContext)
  if (!value) throw new Error("useKnowledgeAuth must be used inside <KnowledgeAuthProvider>")
  return value
}

export function KnowledgeAuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  // Read once on mount, never during render on the server: localStorage
  // does not exist there, and a value that differed between the server
  // and the first client render would be a hydration mismatch.
  const [everSignedIn, setEverSignedIn] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    setEverSignedIn(hasEverSignedIn())
  }, [])

  useEffect(() => {
    if (status === "authenticated") {
      rememberSignedIn()
      setEverSignedIn(true)
    }
  }, [status])

  const state = decideAuthState({ status, everSignedIn })

  // Publish to the plain module so client.ts can consult it from a
  // catch block. An effect, not a render-time call: publishing is a
  // side effect on module state and must not run twice under strict
  // mode's double render.
  useEffect(() => {
    publishAuthState(state)
  }, [state])

  // A lapsed session should not leave a stale dialog hidden behind it,
  // nor keep one open after a successful sign-in.
  useEffect(() => {
    if (state === "authenticated") setDialogOpen(false)
  }, [state])

  const email = session?.user?.email ?? ""
  const value = useMemo<KnowledgeAuthValue>(
    () => ({
      state,
      email,
      name: state === "guest" ? "Guest" : session?.user?.name || email.split("@")[0] || "Your account",
      promptSignIn: () => setDialogOpen(true),
      signOutOfKnowledge: () => {
        forgetSignedIn()
        setEverSignedIn(false)
        void signOutViaNextAuth()
      },
    }),
    [state, email, session?.user?.name],
  )

  return (
    <KnowledgeAuthContext.Provider value={value}>
      {children}
      <SignInDialog open={dialogOpen} state={state} onClose={() => setDialogOpen(false)} />
    </KnowledgeAuthContext.Provider>
  )
}

/** Kept separate so the provider stays readable and the import of
 *  next-auth's signOut is in one place. Returns to /knowledge, not
 *  /login: signing out of a reading app should leave you reading, in
 *  guest mode, rather than at a login wall. */
async function signOutViaNextAuth(): Promise<void> {
  const { signOut } = await import("next-auth/react")
  await signOut({ callbackUrl: "/knowledge" })
}

/* ── The dialog ───────────────────────────────────────────────────── */

function SignInDialog({
  open,
  state,
  onClose,
}: {
  open: boolean
  state: KnowledgeAuthState
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  // The copy is the whole reason the third state exists: a lapsed
  // session is not an invitation to sign up, it is a notice that
  // something the user believed was true has stopped being true.
  const expired = state === "auth_required"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kn-signin-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-[var(--kn-edge)] bg-card p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <h2 id="kn-signin-title" className="font-serif text-2xl font-medium tracking-tight text-foreground">
          {expired ? "Your session ended" : "Save to your account"}
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {expired
            ? "Sign in again to reach the library on your account. Anything you save until then stays on this device."
            : "Sign in to keep your library on every device instead of only this browser."}
        </p>

        <div className="mt-6">
          {/* The same component /login uses — one Google flow, not two.
              callbackUrl returns here rather than to the Workforce
              launcher, so signing in never navigates out of Knowledge. */}
          <GoogleButton callbackUrl="/knowledge" />
        </div>

        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Credentials already has a full form with validation and error
            copy at /login. Sending the user there beats re-implementing
            it here and letting the two drift apart. */}
        <button
          type="button"
          onClick={() => void signIn(undefined, { callbackUrl: "/knowledge" })}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-transparent text-[13px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-secondary/50"
        >
          <LogIn className="size-4" />
          Continue with email
        </button>

        {!expired && (
          <p className="mt-5 text-center text-[12px] leading-relaxed text-muted-foreground">
            Items you saved as a guest stay on this device. Signing in starts a
            library on your account; it does not move them.
          </p>
        )}
      </div>
    </div>
  )
}
