/**
 * Verifies a Firebase Auth ID token inside the Worker — no Firebase Admin SDK
 * (it needs Node APIs this runtime doesn't have). This is the mirror of
 * firestore.ts's service-account JWT *signing* (getAccessToken): same RS256
 * primitive, opposite key usage — here we *verify* a token Google already
 * signed, against Google's own rotating public keys, rather than signing one
 * ourselves.
 */

import { base64urlDecode } from "./base64url.js";

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

interface Jwk {
  kid: string;
  n: string;
  e: string;
}

// Cached across warm invocations, same pattern as firestore.ts's OAuth-token
// cache — Google rotates these infrequently (has for years), an hour is safe.
let _jwks: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_CACHE_MS = 60 * 60 * 1000;

async function getJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (_jwks && now - _jwks.fetchedAt < JWKS_CACHE_MS) return _jwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
  const json = (await res.json()) as { keys: Jwk[] };
  _jwks = { keys: json.keys, fetchedAt: now };
  return json.keys;
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(segment)));
}

export interface VerifiedToken {
  uid: string;
}

export interface TokenHeader {
  kid?: string;
  alg?: string;
}

export interface TokenPayload {
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  sub?: string;
}

/**
 * Pure claim-shape validation — no crypto, no network, fully unit-testable
 * with hand-built payloads. Signature verification (below) is the other half
 * of "genuine token" and can't meaningfully be unit-tested without a real
 * Google-signed token, but this half (right issuer/audience, not expired, not
 * from the future, has a subject) can be and is where most malformed/forged/
 * stale-token rejection actually happens.
 */
export function validateClaims(
  header: TokenHeader,
  payload: TokenPayload,
  projectId: string,
  now: number,
): boolean {
  if (header.alg !== "RS256" || !header.kid) return false;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return false;
  if (payload.aud !== projectId) return false;
  if (typeof payload.exp !== "number" || payload.exp <= now) return false;
  if (typeof payload.iat !== "number" || payload.iat > now + 60) return false; // small clock-skew tolerance
  if (typeof payload.sub !== "string" || !payload.sub) return false;
  return true;
}

/**
 * Verify a Firebase Auth ID token's signature and standard claims. Returns
 * the uid on success, null on ANY failure (expired, wrong project, bad
 * signature, malformed, wrong algorithm) — callers treat null uniformly as
 * "not authenticated" (a 401) rather than branching on the specific reason,
 * so a verification bug never accidentally reveals more than "no").
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
): Promise<VerifiedToken | null> {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = decodeJsonSegment(headerB64) as TokenHeader;
    const payload = decodeJsonSegment(payloadB64) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!validateClaims(header, payload, projectId, now)) return null;

    const jwks = await getJwks();
    const jwk = jwks.find((k) => k.kid === header.kid);
    if (!jwk) return null; // unknown kid — key rotated out, or forged

    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(sigB64);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
    if (!valid) return null;

    return { uid: payload.sub! };
  } catch {
    return null;
  }
}
