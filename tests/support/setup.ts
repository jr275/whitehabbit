/* Loads .env.local (if present) so integration tests hit the same
 * DATABASE_URL the app does. Tests that need the database skip
 * themselves when it is absent, rather than failing the whole suite on
 * a machine that has not provisioned one — see tests/support/db.ts. */
import { config } from "dotenv"
config({ path: ".env.local", quiet: true })
config({ path: ".env.test", quiet: true })
