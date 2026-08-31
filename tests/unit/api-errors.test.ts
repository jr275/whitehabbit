import { describe, expect, it } from "vitest"
import { NotFoundError, RateLimitedError, ValidationError, withApiHandler } from "@/lib/api-error"
import { FieldError } from "@/lib/pocket2/domain/validate"
import { ForbiddenError } from "@/lib/pocket2/domain/authz"
import { UnauthenticatedError, UnauthorizedOrgError } from "@/lib/session"

/* Error mapping is a security surface in its own right: it decides
 * what a caller learns about a failure, and whether a client mistake
 * is recorded as a server fault. */

const statusFor = async (error: Error) => {
  const response = await withApiHandler("test", async () => { throw error })
  return { status: response.status, body: (await response.json()) as { error: string; field?: string } }
}

describe("API error mapping", () => {
  it("maps a validation failure to 400 (API-01 regression)", async () => {
    // REGRESSION: FieldError was unhandled, so every malformed request
    // body returned 500 "Something went wrong" and was written to the
    // error log as an unhandled route error.
    const { status, body } = await statusFor(new FieldError("url", "url must be text."))
    expect(status).toBe(400)
    expect(body.error).toBe("url must be text.")
    expect(body.field).toBe("url")
  })

  it("maps the other known failures to their real codes", async () => {
    expect((await statusFor(new ValidationError("bad"))).status).toBe(400)
    expect((await statusFor(new UnauthenticatedError())).status).toBe(401)
    expect((await statusFor(new ForbiddenError())).status).toBe(403)
    expect((await statusFor(new RateLimitedError())).status).toBe(429)
  })

  it("reports a cross-tenant resource as 404, never 403", async () => {
    // 403 would confirm the resource exists in some other tenant.
    const crossTenant = await statusFor(new UnauthorizedOrgError())
    const missing = await statusFor(new NotFoundError())
    expect(crossTenant.status).toBe(404)
    expect(crossTenant.body).toEqual(missing.body)
  })

  it("does not leak internal details of a genuine server fault", async () => {
    const { status, body } = await statusFor(new Error("connection to 10.0.0.5:5432 refused, password=hunter2"))
    expect(status).toBe(500)
    expect(body.error).not.toContain("10.0.0.5")
    expect(body.error).not.toContain("hunter2")
  })
})

describe("structured logs never carry a credential (LOG-01)", () => {
  /* REGRESSION: withApiHandler logs an unhandled error's message
   * verbatim, and a driver error's message can embed the connection
   * string it failed on. The response body was already scrubbed; the
   * log line was not. */
  const captureLog = async (fn: () => Promise<unknown>) => {
    const lines: string[] = []
    const original = console.error
    console.error = (text: string) => { lines.push(String(text)) }
    try { await fn() } finally { console.error = original }
    return lines.join("\n")
  }

  it.each([
    ["a postgres connection string", "connect ECONNREFUSED postgres://app:s3cr3t@10.0.0.5:5432/db", "s3cr3t"],
    ["a password parameter", "auth failed: password=hunter2 for user app", "hunter2"],
    ["a bearer token", "upstream said 401 for Authorization: Bearer abcdef0123456789xyz", "abcdef0123456789xyz"],
    ["an api key parameter", "request failed api_key=AKIAIOSFODNN7EXAMPLE", "AKIAIOSFODNN7EXAMPLE"],
  ])("redacts %s", async (_label, message, secret) => {
    const logged = await captureLog(() => withApiHandler("test", async () => { throw new Error(message) }))
    expect(logged, "the secret reached the log").not.toContain(secret)
    expect(logged).toContain("redacted")
  })

  it("keeps ordinary diagnostic detail intact", async () => {
    const logged = await captureLog(() =>
      withApiHandler("test", async () => { throw new Error("timeout after 20000ms fetching https://example.com/a/b") }))
    expect(logged).toContain("timeout after 20000ms")
    expect(logged).toContain("example.com")
  })
})
