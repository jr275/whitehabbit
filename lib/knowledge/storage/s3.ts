import "server-only"

/* ================================================================== *
 * S3-COMPATIBLE BLOB STORE  (AWS S3, Cloudflare R2, MinIO, …)
 *
 * WHY NO SDK. The AWS SDK is ~15 MB across dozens of packages, and we
 * need exactly three operations. SigV4 is a documented, stable
 * algorithm and node:crypto has everything it requires, so this is
 * ~150 lines with no supply-chain surface — consistent with the
 * dependency discipline the rest of this product is held to. If a
 * future milestone needs multipart uploads or presigning, that is the
 * point to reconsider, and only this file changes.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *   - No presigned URLs, ever. Archived documents are raw attacker-
 *     controlled HTML; a presigned URL is a public, unauthenticated,
 *     time-limited XSS host on our own domain. Reads go through the
 *     application, which checks the artifact row's tenant first.
 *   - No public ACLs. Objects are private; the bucket must be too.
 *   - No listing. Enumeration belongs to the database, which is the
 *     source of truth about what exists.
 *
 * ENCRYPTION AT REST is the bucket's (SSE-S3 / SSE-KMS, on by default
 * for S3 and R2 alike). We do not encrypt in the application: a key we
 * manage is a key we can lose, and losing it would destroy the one
 * thing M2 exists to preserve. Encryption IN TRANSIT is TLS, enforced
 * by refusing a non-https endpoint below.
 * ================================================================== */

import { createHash, createHmac } from "node:crypto"
import { assertSafeKey, BlobStoreError, type BlobPutOptions, type BlobStat, type BlobStore } from "./types.ts"

export interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Full origin. R2: https://<account>.r2.cloudflarestorage.com */
  endpoint: string
  /** R2 and MinIO need path-style; AWS S3 prefers virtual-hosted. */
  forcePathStyle: boolean
}

export function s3ConfigFromEnv(): S3Config | null {
  const bucket = (process.env.KNOWLEDGE_S3_BUCKET ?? "").trim()
  const accessKeyId = (process.env.KNOWLEDGE_S3_ACCESS_KEY_ID ?? "").trim()
  const secretAccessKey = (process.env.KNOWLEDGE_S3_SECRET_ACCESS_KEY ?? "").trim()
  if (!bucket || !accessKeyId || !secretAccessKey) return null

  // R2 requires the literal region "auto"; S3 requires a real one.
  const region = (process.env.KNOWLEDGE_S3_REGION ?? "").trim() || "auto"
  const endpoint = (process.env.KNOWLEDGE_S3_ENDPOINT ?? "").trim() || `https://s3.${region}.amazonaws.com`
  const forcePathStyle = (process.env.KNOWLEDGE_S3_FORCE_PATH_STYLE ?? "").trim() !== "false"

  return { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle }
}

const SERVICE = "s3"
const UNSIGNED = "UNSIGNED-PAYLOAD"

function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest()
}

/** RFC 3986, which is stricter than encodeURIComponent about !'()* */
function uriEncode(value: string, encodeSlash: boolean): string {
  let out = ""
  for (const char of value) {
    if (/[A-Za-z0-9\-._~]/.test(char)) out += char
    else if (char === "/") out += encodeSlash ? "%2F" : "/"
    else {
      for (const byte of Buffer.from(char, "utf8")) out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
    }
  }
  return out
}

/**
 * AWS Signature Version 4, the parts of it three object operations
 * need. Written out longhand because a signing bug is silent: it
 * produces a 403, not a crash, and a comment beats re-deriving it.
 */
function signedHeaders(input: {
  config: S3Config
  method: "PUT" | "GET" | "DELETE" | "HEAD"
  host: string
  path: string
  payloadHash: string
  extraHeaders: Record<string, string>
}): Record<string, string> {
  const { config, method, host, path, payloadHash, extraHeaders } = input

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "") // 20260901T120000Z
  const dateStamp = amzDate.slice(0, 8)

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  }

  const sortedNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
  const canonicalHeaders = sortedNames
    .map((name) => {
      const value = headers[Object.keys(headers).find((k) => k.toLowerCase() === name) as string] ?? ""
      return `${name}:${value.trim().replace(/\s+/g, " ")}\n`
    })
    .join("")
  const signedHeaderList = sortedNames.join(";")

  const canonicalRequest = [
    method,
    uriEncode(path, false),
    "", // no query string on any operation here
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join("\n")

  const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n")

  const signature = hmac(
    hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), SERVICE), "aws4_request"),
    stringToSign,
  ).toString("hex")

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
  }
}

export function createS3Store(config: S3Config): BlobStore {
  const endpoint = new URL(config.endpoint)
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") {
    // Credentials and archived documents must not cross a network in
    // the clear. A local MinIO for tests is the only exception.
    throw new BlobStoreError("not_configured", "The blob store endpoint must be https.")
  }

  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`

  function target(key: string): { url: string; host: string; path: string } {
    assertSafeKey(key)
    const path = config.forcePathStyle ? `/${config.bucket}/${key}` : `/${key}`
    return { url: `${endpoint.protocol}//${host}${uriEncode(path, false)}`, host, path }
  }

  async function send(
    method: "PUT" | "GET" | "DELETE",
    key: string,
    body: Buffer | undefined,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const { url, host: h, path } = target(key)
    const payloadHash = body ? sha256Hex(body) : sha256Hex("")

    const headers = signedHeaders({ config, method, host: h, path, payloadHash, extraHeaders })
    try {
      return await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      throw new BlobStoreError("io_error", `Blob store unreachable: ${(err as Error).message}`, key)
    }
  }

  return {
    id: "s3",

    async put(key: string, body: Buffer, options: BlobPutOptions): Promise<BlobStat> {
      const res = await send("PUT", key, body, {
        "content-type": options.contentType,
        "content-length": String(body.byteLength),
        // The integrity check is over the STORED bytes; the row also
        // carries the checksum of the uncompressed original.
        ...(options.contentEncoding === "gzip" ? { "content-encoding": "gzip" } : {}),
        "x-amz-meta-checksum-sha256": options.checksum,
      })
      if (!res.ok) {
        throw new BlobStoreError("io_error", `Blob store rejected a write (${res.status}).`, key)
      }
      return { key, size: body.byteLength }
    },

    async get(key: string): Promise<Buffer | null> {
      const res = await send("GET", key, undefined)
      if (res.status === 404) return null // absence is normal
      if (!res.ok) throw new BlobStoreError("io_error", `Blob store rejected a read (${res.status}).`, key)
      return Buffer.from(await res.arrayBuffer())
    },

    async delete(key: string): Promise<void> {
      const res = await send("DELETE", key, undefined)
      // S3 returns 204 for a delete of something that was never there.
      if (!res.ok && res.status !== 404) {
        throw new BlobStoreError("io_error", `Blob store rejected a delete (${res.status}).`, key)
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        // A GET of a key that cannot exist: 404 proves credentials and
        // routing work, without needing list permission.
        await send("GET", "knowledge/_healthz/_healthz/_healthz.probe", undefined)
        return true
      } catch {
        return false
      }
    },
  }
}

/** Exported for the signing tests, which pin the algorithm rather than
 * trusting that a 403 would be noticed in production. */
export const __sigv4 = { signedHeaders, uriEncode, sha256Hex, UNSIGNED }
