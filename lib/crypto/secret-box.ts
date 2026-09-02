import "server-only"

/* ================================================================== *
 * SECRET BOX — the smallest real, secure abstraction this deployment
 * needs to store an OAuth token at rest: AES-256-GCM via Node's own
 * built-in crypto module (no new dependency).
 *
 * ENCRYPTION_KEY must be a real, 32-byte key (base64 or hex encoded).
 * If it is not configured, encrypt()/decrypt() throw rather than fall
 * back to storing a token in plaintext — a missing key is reported as
 * "encryption not configured", the same honest NOT_CONFIGURED pattern
 * every credential in this deployment already follows, never silently
 * downgraded to an insecure default.
 * ================================================================== */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // GCM's recommended nonce length

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super("Configure ENCRYPTION_KEY (a real 32-byte key, base64 or hex) to store credentials at rest.")
    this.name = "EncryptionNotConfiguredError"
  }
}

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new EncryptionNotConfiguredError()
  // accept either base64 or hex, whichever decodes to exactly 32 bytes
  for (const encoding of ["base64", "hex"] as const) {
    const buf = Buffer.from(raw, encoding)
    if (buf.length === 32) return buf
  }
  throw new Error("ENCRYPTION_KEY must decode (as base64 or hex) to exactly 32 bytes.")
}

export function isEncryptionConfigured(): boolean {
  try {
    loadKey()
    return true
  } catch {
    return false
  }
}

/** Real AES-256-GCM encryption — returns iv:authTag:ciphertext, all
 * base64, joined with ".". Throws EncryptionNotConfiguredError if
 * ENCRYPTION_KEY isn't set; callers must treat that as a real
 * precondition failure, never catch-and-store-plaintext. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".")
}

export function decryptSecret(sealed: string): string {
  const key = loadKey()
  const [ivB64, tagB64, ctB64] = sealed.split(".")
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted value.")
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8")
}
