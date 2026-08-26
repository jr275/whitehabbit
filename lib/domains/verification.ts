import "server-only"

/* ================================================================== *
 * DOMAIN VERIFICATION (§15) — a real DNS lookup, never an assumption.
 * Two methods, matching how every real hosting platform verifies
 * domain ownership:
 *
 *   dns_txt:   a TXT record at _whitehabbit-verify.<hostname> must
 *              equal the domain's own random verification_token.
 *   dns_cname: a CNAME record at <hostname> must point to
 *              <token>.verify.<VERIFY_CNAME_TARGET_HOST> — proves
 *              control of the hostname's DNS the same way a real
 *              CNAME-based verification flow does.
 *
 * Never stores a secret unnecessarily (§15) — the token is not a
 * credential, it's a public value the tenant is asked to publish in
 * their own public DNS; the only thing recorded is the real observed
 * result, success or failure, never a fabricated one.
 * ================================================================== */

import { resolveCname, resolveTxt } from "node:dns/promises"
import { getDomain, markFailed, markVerified, recordVerificationAttempt } from "./repo"
import type { Domain, DomainVerificationMethod } from "./model"

const VERIFY_CNAME_TARGET_HOST = process.env.DOMAIN_VERIFY_CNAME_HOST ?? "verify.whitehabbit.example"

export interface VerificationOutcome {
  success: boolean
  detail: string
}

async function checkTxt(domain: Domain): Promise<VerificationOutcome> {
  const recordHost = `_whitehabbit-verify.${domain.hostname}`
  try {
    const records = await resolveTxt(recordHost)
    const flat = records.map((chunks) => chunks.join(""))
    const found = flat.find((v) => v === domain.verificationToken)
    return found
      ? { success: true, detail: `Found matching TXT record at ${recordHost}.` }
      : { success: false, detail: `No TXT record at ${recordHost} matched the expected token. Found: ${flat.join(", ") || "(none)"}` }
  } catch (err) {
    return { success: false, detail: `Could not resolve TXT records at ${recordHost}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function checkCname(domain: Domain): Promise<VerificationOutcome> {
  const expectedTarget = `${domain.verificationToken}.${VERIFY_CNAME_TARGET_HOST}`
  try {
    const records = await resolveCname(domain.hostname)
    const found = records.find((r) => r.toLowerCase().replace(/\.$/, "") === expectedTarget.toLowerCase())
    return found
      ? { success: true, detail: `Found matching CNAME record at ${domain.hostname} -> ${expectedTarget}.` }
      : { success: false, detail: `No CNAME record at ${domain.hostname} matched ${expectedTarget}. Found: ${records.join(", ") || "(none)"}` }
  } catch (err) {
    return { success: false, detail: `Could not resolve CNAME records for ${domain.hostname}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Runs the real check, records the attempt, and — only on real success
 * — marks the domain verified. Never assumes verification (§15); a
 * failure is recorded just as faithfully as a success. */
export async function verifyDomain(id: string, orgId: string, method: DomainVerificationMethod): Promise<VerificationOutcome> {
  const domain = await getDomain(id, orgId)
  if (!domain) throw new Error(`Domain ${id} not found for this organization.`)

  const outcome = method === "dns_txt" ? await checkTxt(domain) : await checkCname(domain)
  await recordVerificationAttempt({ orgId, domainId: id, method, result: outcome.success ? "success" : "failure", detail: outcome.detail })

  if (outcome.success) await markVerified(id, orgId, method)
  else await markFailed(id, orgId)

  return outcome
}
