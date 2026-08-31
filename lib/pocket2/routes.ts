/* ================================================================== *
 * ROUTE CONSTANTS — every Pocket2 path in one place.
 *
 * Pocket2 is mounted under /pocket2 rather than at the site root
 * because the root currently serves the existing product, and quietly
 * replacing another product's entry point is not this phase's call to
 * make. Re-rooting later means changing POCKET2_BASE here and moving
 * one directory — nothing else references the prefix literally.
 * ================================================================== */

export const POCKET2_BASE = "/pocket2"

export const POCKET2_HOME = `${POCKET2_BASE}/library`
export const POCKET2_LOGIN = `${POCKET2_BASE}/login`
export const POCKET2_SIGNUP = `${POCKET2_BASE}/signup`

export const POCKET2_ROUTES = {
  landing: POCKET2_BASE,
  login: POCKET2_LOGIN,
  signup: POCKET2_SIGNUP,
  library: POCKET2_HOME,
  unread: `${POCKET2_BASE}/library?status=unread`,
  favorites: `${POCKET2_BASE}/library?status=favorite`,
  archive: `${POCKET2_BASE}/library?status=archived`,
  collections: `${POCKET2_BASE}/collections`,
  tags: `${POCKET2_BASE}/tags`,
  settings: `${POCKET2_BASE}/settings`,
  item: (id: string) => `${POCKET2_BASE}/items/${id}`,
  reader: (id: string) => `${POCKET2_BASE}/read/${id}`,
} as const

/** Paths that require a session. Used by the route protection in
 * middleware.ts and mirrored by requireTenant() in every handler —
 * the redirect is a convenience, the server check is the boundary. */
export const POCKET2_PROTECTED_PREFIXES = [
  POCKET2_HOME,
  `${POCKET2_BASE}/collections`,
  `${POCKET2_BASE}/tags`,
  `${POCKET2_BASE}/settings`,
  `${POCKET2_BASE}/items`,
  `${POCKET2_BASE}/read`,
]
