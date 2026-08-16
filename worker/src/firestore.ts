/**
 * Minimal Firestore REST client for a Cloudflare Worker (no firebase-admin — it
 * needs Node APIs). Authenticates with a Google service account by signing a
 * JWT with Web Crypto and exchanging it for an OAuth access token, then talks to
 * the Firestore REST API. Only the value types PlanR actually stores are
 * decoded/encoded.
 */

import { base64url } from "./base64url.js";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** Secret — the shared Gemini API key (Google AI Studio). Never sent to clients. */
  GEMINI_API_KEY: string;
  /** Plain var, not a secret — tunable without `wrangler secret put`. */
  GEMINI_MODEL?: string;
  AI_PER_USER_DAILY_CAP?: string;
  AI_GLOBAL_DAILY_CAP?: string;
}

// ── Auth (service-account JWT → access token) ────────────────────────────────

let _token: { value: string; exp: number } | null = null;

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_token && _token.exp - 60 > now) return _token.value;

  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: env.FIREBASE_CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const unsigned = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _token = { value: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

// ── Value codec (Firestore REST typed values ⇄ plain JS) ─────────────────────

type FsValue = Record<string, unknown>;

export function decodeValue(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue as boolean;
  if ("integerValue" in v) return Number(v.integerValue as string);
  if ("doubleValue" in v) return v.doubleValue as number;
  if ("stringValue" in v) return v.stringValue as string;
  if ("timestampValue" in v) return v.timestampValue as string;
  if ("mapValue" in v) return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  if ("arrayValue" in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(decodeValue);
  return undefined;
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(fields)) out[k] = decodeValue(fields[k]);
  return out;
}

function encodeValue(val: unknown): FsValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeValue) } };
  if (typeof val === "object") return { mapValue: { fields: encodeFields(val as Record<string, unknown>) } };
  return { nullValue: null };
}

function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const k of Object.keys(obj)) out[k] = encodeValue(obj[k]);
  return out;
}

// ── REST calls ───────────────────────────────────────────────────────────────

export interface FsDoc { name: string; fields: Record<string, unknown>; }

export class Firestore {
  private base: string;
  constructor(private env: Env) {
    this.base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  }

  private async auth(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await getAccessToken(this.env)}`, "content-type": "application/json" };
  }

  /** Collection-group query returning every doc in any `collectionId` subcollection. */
  async collectionGroup(collectionId: string): Promise<FsDoc[]> {
    const res = await fetch(`${this.base}:runQuery`, {
      method: "POST",
      headers: await this.auth(),
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }] } }),
    });
    if (!res.ok) throw new Error(`runQuery failed: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, FsValue> } }>;
    return rows
      .filter((r) => r.document)
      .map((r) => ({ name: r.document!.name, fields: decodeFields(r.document!.fields ?? {}) }));
  }

  /** Get a single document by relative path (e.g. "users/uid/data/snapshot"). Null on 404. */
  async getDoc(path: string): Promise<FsDoc | null> {
    const res = await fetch(`${this.base}/${path}`, { headers: await this.auth() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get ${path} failed: ${res.status}`);
    const doc = (await res.json()) as { name: string; fields?: Record<string, FsValue> };
    return { name: doc.name, fields: decodeFields(doc.fields ?? {}) };
  }

  /** List documents in a collection path (e.g. "users/uid/pushSubscriptions"). */
  async listDocs(path: string): Promise<FsDoc[]> {
    const res = await fetch(`${this.base}/${path}?pageSize=300`, { headers: await this.auth() });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`list ${path} failed: ${res.status}`);
    const json = (await res.json()) as { documents?: Array<{ name: string; fields?: Record<string, FsValue> }> };
    return (json.documents ?? []).map((d) => ({ name: d.name, fields: decodeFields(d.fields ?? {}) }));
  }

  /** Create/overwrite a document's fields (used for the per-user "sent" marker). */
  async setDoc(path: string, data: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.base}/${path}`, {
      method: "PATCH",
      headers: await this.auth(),
      body: JSON.stringify({ fields: encodeFields(data) }),
    });
    if (!res.ok) throw new Error(`set ${path} failed: ${res.status}`);
  }

  async deleteDoc(path: string): Promise<void> {
    await fetch(`${this.base}/${path}`, { method: "DELETE", headers: await this.auth() }).catch(() => undefined);
  }
}

/** The uid embedded in a document `name` like ".../documents/users/{uid}/push/config". */
export function uidFromName(name: string): string | null {
  const m = name.match(/\/users\/([^/]+)\//);
  return m ? m[1] : null;
}

/** The last path segment of a document `name` (its id). */
export function idFromName(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}
