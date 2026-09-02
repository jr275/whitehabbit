import "server-only"

/* Real bcrypt hashing (bcryptjs — pure JS, no native build step, so
 * it works the same in every deployment target including Vercel's
 * serverless functions). 12 rounds is bcrypt's commonly recommended
 * production cost factor as of 2026. */

import { createHash, randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"

const ROUNDS = 12

/** A cryptographically-random, URL-safe reset token (the raw value
 * that goes in the emailed link) plus its SHA-256 hash (the only thing
 * we ever store). Same principle as password hashing: a database leak
 * must not yield usable reset links. */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, tokenHash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** A minimum real bar, not a homemade strength meter — length is the
 * one rule that meaningfully resists brute force at hashing time. */
export function isPasswordAcceptable(password: string): boolean {
  return typeof password === "string" && password.length >= 8
}
