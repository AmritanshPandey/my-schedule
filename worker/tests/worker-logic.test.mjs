import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// worker/src uses TS+ESM's ".js"-specifier-resolves-to-sibling-".ts"-file
// convention (e.g. `import { x } from "./firestore.js"` really means
// firestore.ts) — Node's own resolver doesn't know that convention, so
// redirect any relative ".js" specifier to its ".ts" sibling before falling
// back to normal resolution.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".js") && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      try {
        return nextResolve(specifier.slice(0, -3) + ".ts", context);
      } catch {
        // fall through
      }
    }
    return nextResolve(specifier, context);
  },
});

const { checkAndIncrement, todayUTC } = await import("../src/usage.ts");
const { validateClaims } = await import("../src/auth.ts");
const { base64url, base64urlDecode } = await import("../src/base64url.ts");

// ── base64url ───────────────────────────────────────────────────────────────
// Every input length mod 4 (0, 2, 3 — base64 never produces 1) since the
// decode padding math branches on that.

test("base64url encode/decode round-trips for every padding case", () => {
  for (const input of ["", "a", "ab", "abc", "abcd", "hello world", "🎉 unicode bytes"]) {
    const bytes = new TextEncoder().encode(input);
    const encoded = base64url(bytes);
    assert.doesNotMatch(encoded, /[+/=]/, "no non-url-safe characters");
    const decoded = base64urlDecode(encoded);
    assert.equal(new TextDecoder().decode(decoded), input);
  }
});

// ── todayUTC ────────────────────────────────────────────────────────────────

test("todayUTC formats as YYYY-MM-DD", () => {
  assert.equal(todayUTC(new Date("2026-03-05T14:22:00Z")), "2026-03-05");
});

test("todayUTC rolls over at the UTC day boundary, not local time", () => {
  assert.equal(todayUTC(new Date("2026-03-05T23:59:59Z")), "2026-03-05");
  assert.equal(todayUTC(new Date("2026-03-06T00:00:00Z")), "2026-03-06");
});

// ── checkAndIncrement ───────────────────────────────────────────────────────

/** A minimal Firestore-shaped mock: an in-memory doc store keyed by path. */
function mockFirestore(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async getDoc(path) {
      const fields = store.get(path);
      return fields ? { name: path, fields } : null;
    },
    async setDoc(path, data) {
      store.set(path, data);
    },
  };
}

test("checkAndIncrement allows a fresh user/day and increments both counters", async () => {
  const fs = mockFirestore();
  const now = new Date("2026-03-05T12:00:00Z");
  const result = await checkAndIncrement(fs, "uid-1", { perUser: 5, global: 10 }, now);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(fs.store.get("users/uid-1/aiUsage/2026-03-05"), { date: "2026-03-05", count: 1 });
  assert.deepEqual(fs.store.get("system/aiUsage/2026-03-05"), { date: "2026-03-05", count: 1 });
});

test("checkAndIncrement rejects once the per-user cap is met, without incrementing", async () => {
  const fs = mockFirestore({
    "users/uid-1/aiUsage/2026-03-05": { date: "2026-03-05", count: 5 },
    "system/aiUsage/2026-03-05": { date: "2026-03-05", count: 5 },
  });
  const now = new Date("2026-03-05T12:00:00Z");
  const result = await checkAndIncrement(fs, "uid-1", { perUser: 5, global: 100 }, now);
  assert.deepEqual(result, { ok: false, reason: "per-user-cap" });
  // Rejected requests don't cost budget — count stays exactly where it was.
  assert.equal(fs.store.get("users/uid-1/aiUsage/2026-03-05").count, 5);
  assert.equal(fs.store.get("system/aiUsage/2026-03-05").count, 5);
});

test("checkAndIncrement rejects on the global cap even when the user is under their own", async () => {
  const fs = mockFirestore({
    "system/aiUsage/2026-03-05": { date: "2026-03-05", count: 300 },
  });
  const now = new Date("2026-03-05T12:00:00Z");
  const result = await checkAndIncrement(fs, "uid-2", { perUser: 20, global: 300 }, now);
  assert.deepEqual(result, { ok: false, reason: "global-cap" });
});

test("checkAndIncrement treats a stale prior-day counter as reset", async () => {
  const fs = mockFirestore({
    "users/uid-1/aiUsage/2026-03-04": { date: "2026-03-04", count: 20 }, // yesterday, at cap
  });
  const now = new Date("2026-03-05T00:00:01Z"); // new UTC day
  const result = await checkAndIncrement(fs, "uid-1", { perUser: 20, global: 300 }, now);
  assert.deepEqual(result, { ok: true }, "yesterday's counter doesn't carry over to today's key");
  assert.equal(fs.store.get("users/uid-1/aiUsage/2026-03-05").count, 1);
});

// ── validateClaims ──────────────────────────────────────────────────────────

const PROJECT = "planr-75429";
function validPayload(now, overrides = {}) {
  return {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    exp: now + 3600,
    iat: now - 10,
    sub: "some-uid",
    ...overrides,
  };
}
const validHeader = { alg: "RS256", kid: "abc123" };

test("validateClaims accepts a well-formed, current, correctly-scoped token", () => {
  const now = 1_700_000_000;
  assert.equal(validateClaims(validHeader, validPayload(now), PROJECT, now), true);
});

test("validateClaims rejects a wrong issuer (different Firebase project)", () => {
  const now = 1_700_000_000;
  const payload = validPayload(now, { iss: "https://securetoken.google.com/some-other-project" });
  assert.equal(validateClaims(validHeader, payload, PROJECT, now), false);
});

test("validateClaims rejects a mismatched audience", () => {
  const now = 1_700_000_000;
  const payload = validPayload(now, { aud: "some-other-project" });
  assert.equal(validateClaims(validHeader, payload, PROJECT, now), false);
});

test("validateClaims rejects an expired token", () => {
  const now = 1_700_000_000;
  const payload = validPayload(now, { exp: now - 1 });
  assert.equal(validateClaims(validHeader, payload, PROJECT, now), false);
});

test("validateClaims rejects a token issued too far in the future (clock-skew abuse)", () => {
  const now = 1_700_000_000;
  const payload = validPayload(now, { iat: now + 3600 });
  assert.equal(validateClaims(validHeader, payload, PROJECT, now), false);
});

test("validateClaims rejects a missing subject", () => {
  const now = 1_700_000_000;
  const payload = validPayload(now, { sub: undefined });
  assert.equal(validateClaims(validHeader, payload, PROJECT, now), false);
});

test("validateClaims rejects a non-RS256 algorithm or missing kid", () => {
  const now = 1_700_000_000;
  const payload = validPayload(now);
  assert.equal(validateClaims({ alg: "HS256", kid: "abc" }, payload, PROJECT, now), false);
  assert.equal(validateClaims({ alg: "RS256" }, payload, PROJECT, now), false);
});
