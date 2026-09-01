/* Shared security utilities. Security code must have exactly ONE
 * implementation in the repository; Knowledge reuses this rather than
 * reimplementing private-range checks. */
export { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"
