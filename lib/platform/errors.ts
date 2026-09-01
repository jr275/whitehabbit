/* Shared error -> HTTP mapping. Imports next/server, so it is kept in
 * its own module: only route handlers should pull it in. */
export { withApiHandler, NotFoundError, ValidationError, RateLimitedError } from "@/lib/api-error"
