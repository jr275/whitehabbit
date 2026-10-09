import "server-only"

/* ================================================================== *
 * IS THIS DEPLOYMENT FINISHED?
 *
 * Every piece of configuration the product needs, reported as one
 * list, each line naming the EXACT environment variable that is
 * missing.
 *
 * WHY THIS EXISTS. Each check below already existed and each one was
 * answerable only in the place it was used: sign-in knew whether there
 * was a database, search knew whether embeddings were configured, the
 * LLM providers knew whether they had a credential, and nothing at all
 * knew about CRON_SECRET. So a half-configured deployment failed in
 * five unrelated places with five unrelated messages, none of which
 * said which variable to set — and the person operating it had to ask
 * someone who could read the source.
 *
 * This composes those existing checks. It does not add a sixth one,
 * and it does not re-derive any of them: authReadiness, the embedding
 * provider's isConfigured(), and each LLM provider's own
 * notConfiguredReason() are the authorities, exactly as they are at
 * their own call sites.
 *
 * NAMES, NEVER VALUES. A check reports whether a variable is set and
 * what it is called. It never reports its content, its length, or a
 * prefix of it. The whole point is to be safe to show on a screen a
 * signed-in person can open, so a diagnosis must not become a
 * disclosure — see the test that asserts exactly this.
 * ================================================================== */

import { resolveEmbeddingProvider } from "@/lib/ai/embeddings"
import { resolveLlmProvider } from "@/lib/ai/llm"
import { authReadiness } from "@/lib/auth-features"

export interface ReadinessCheck {
  /** Stable key, for tests and for React keys. */
  id: "database" | "session" | "embeddings" | "textModel" | "queue"
  /** What a person recognises, not what the code calls it. */
  label: string
  ok: boolean
  /** The environment variables to set, when it is not ok. EMPTY when
   *  it is — there is nothing to do and nothing to name. */
  missing: string[]
  /** One sentence on what stops working while this is unset. Written
   *  as a consequence, not as an instruction: the missing variable
   *  names above already say what to do. */
  consequence: string
}

export interface DeploymentReadiness {
  ready: boolean
  checks: ReadinessCheck[]
}

export function deploymentReadiness(): DeploymentReadiness {
  const auth = authReadiness()
  const embeddings = resolveEmbeddingProvider()
  const llm = resolveLlmProvider()

  const checks: ReadinessCheck[] = [
    {
      id: "database",
      label: "Database",
      ok: auth.database,
      missing: auth.database ? [] : ["DATABASE_URL"],
      consequence: "Nothing can be saved or read, and nobody can sign in.",
    },
    {
      id: "session",
      label: "Session secret",
      ok: auth.sessionSecret,
      missing: auth.sessionSecret ? [] : ["AUTH_SECRET"],
      consequence: "A sign-in cannot be kept, so signing in appears to fail.",
    },
    {
      id: "embeddings",
      label: "Meaning-based search",
      ok: embeddings.isConfigured(),
      // BOTH names, always, because the provider's own check requires
      // both and reporting only the one that happens to be checked
      // first would send someone back for a second round.
      missing: embeddings.isConfigured() ? [] : ["GEMINI_API_KEY", "GEMINI_EMBEDDING_MODEL"],
      consequence: "Search matches exact words only, and saved pieces are never connected.",
    },
    textModelCheck(llm),
    {
      id: "queue",
      label: "Background processing",
      ok: Boolean(process.env.CRON_SECRET),
      missing: process.env.CRON_SECRET ? [] : ["CRON_SECRET"],
      // The failure mode worth naming: work is NOT lost, it simply
      // never starts, which looks identical to a feature that does
      // nothing.
      consequence: "Queued work is never picked up, so it waits forever instead of failing.",
    },
  ]

  return { ready: checks.every((c) => c.ok), checks }
}

/** The text model is the one check whose required variables depend on
 *  another variable. Resolution failure (an unrecognised LLM_PROVIDER)
 *  is its own case: the provider list cannot tell us what is missing
 *  because it does not know which provider was meant. */
function textModelCheck(llm: ReturnType<typeof resolveLlmProvider>): ReadinessCheck {
  const base = {
    id: "textModel" as const,
    label: "Text model",
    consequence: "Summaries and extracted ideas are never produced, so Insights and Connections stay empty.",
  }

  if ("error" in llm) return { ...base, ok: false, missing: ["LLM_PROVIDER"] }
  if (llm.provider.isConfigured()) return { ...base, ok: true, missing: [] }

  // Each provider knows its own requirements; this only decides which
  // one is being asked. LLM_PROVIDER is named alongside so that a
  // deployment holding the OTHER provider's credential can see that
  // switching is an option.
  const missing =
    llm.provider.id === "gemini"
      ? ["GEMINI_API_KEY", "GEMINI_MODEL", "LLM_PROVIDER"]
      : ["ANTHROPIC_API_KEY", "LLM_PROVIDER"]

  return { ...base, ok: false, missing }
}
