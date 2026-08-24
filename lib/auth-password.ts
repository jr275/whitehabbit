import "server-only"

/* Real bcrypt hashing (bcryptjs — pure JS, no native build step, so
 * it works the same in every deployment target including Vercel's
 * serverless functions). 12 rounds is bcrypt's commonly recommended
 * production cost factor as of 2026. */

import bcrypt from "bcryptjs"

const ROUNDS = 12

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
