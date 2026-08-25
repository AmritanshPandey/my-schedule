/**
 * The compare-and-swap rule that ends multi-device data loss.
 *
 * The bug these pin: device A edits and syncs; device B, holding older data,
 * is opened and pushes its whole snapshot over A's work. Every case below is a
 * variation on "may B write?" and the answer has to come from what B has
 * absorbed, never from whose wall clock is ahead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

function resolveWithTsFallback(url, context, nextResolve) {
  try {
    return nextResolve(url, context);
  } catch {
    try {
      return nextResolve(`${url}.ts`, context);
    } catch {
      return nextResolve(`${url}.tsx`, context);
    }
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      return resolveWithTsFallback(url, context, nextResolve);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        const url = new URL(specifier, context.parentURL).href;
        try {
          return nextResolve(`${url}.ts`, context);
        } catch {
          return nextResolve(`${url}.tsx`, context);
        }
      }
      throw error;
    }
  },
});

const { pushIsSafe } = await import("@/lib/syncRevision.ts");

const AN_HOUR_AGO = 1_700_000_000_000;
const NOW = AN_HOUR_AGO + 3_600_000;

// ── The reported bug ────────────────────────────────────────────────────────

test("a device that never absorbed the current rev cannot push over it", () => {
  // Device A pushed rev 7. Device B last pushed rev 3 and has not pulled since.
  const remote = { rev: 7, lastUpdated: NOW, schedule: {} };
  assert.equal(pushIsSafe(remote, 3, NOW), false);
});

test("a fast clock does not buy a licence to overwrite", () => {
  // B's local stamp is an hour ahead of the remote — the old code's entire
  // freshness test — but B is still two revisions behind.
  const remote = { rev: 7, lastUpdated: AN_HOUR_AGO, schedule: {} };
  assert.equal(pushIsSafe(remote, 5, NOW), false);
});

test("the device holding the current rev may push", () => {
  const remote = { rev: 7, lastUpdated: AN_HOUR_AGO, schedule: {} };
  assert.equal(pushIsSafe(remote, 7, AN_HOUR_AGO), true);
});

// ── Single-device offline editing must keep working ─────────────────────────
// The base rev is persisted in localStorage precisely so this case doesn't
// regress into a false conflict on every reload.

test("editing offline then reconnecting still pushes — same device, same rev", () => {
  const remote = { rev: 4, lastUpdated: AN_HOUR_AGO, schedule: {} };
  assert.equal(pushIsSafe(remote, 4, NOW), true);
});

test("a missing remote document is always safe to write", () => {
  assert.equal(pushIsSafe(null, null, 0), true);
  assert.equal(pushIsSafe(null, 9, NOW), true);
});

// ── Migration window: documents written before this scheme existed ──────────

test("a never-pulled device may adopt a pre-CAS document that isn't newer", () => {
  const legacy = { lastUpdated: AN_HOUR_AGO, schedule: {} }; // no rev field
  assert.equal(pushIsSafe(legacy, null, NOW), true);
});

test("a never-pulled device may NOT overwrite a newer pre-CAS document", () => {
  const legacy = { lastUpdated: NOW, schedule: {} };
  assert.equal(pushIsSafe(legacy, null, AN_HOUR_AGO), false);
});

test("once any device writes a rev, a never-pulled device is locked out", () => {
  // This is what closes the migration window: the legacy lastUpdated fallback
  // must not survive one moment past the first CAS write.
  const remote = { rev: 1, lastUpdated: AN_HOUR_AGO, schedule: {} };
  assert.equal(pushIsSafe(remote, null, NOW), false);
});

// ── rev 0 vs absent rev ─────────────────────────────────────────────────────

test("a base rev of 0 matches a document with no rev field", () => {
  // A device that pulled a legacy document records base rev 0; that pull is a
  // real incorporation and must not be punished as a conflict.
  const legacy = { lastUpdated: NOW, schedule: {} };
  assert.equal(pushIsSafe(legacy, 0, AN_HOUR_AGO), true);
});

test("a base rev of 0 does not match a document already at rev 1", () => {
  const remote = { rev: 1, lastUpdated: NOW, schedule: {} };
  assert.equal(pushIsSafe(remote, 0, NOW), false);
});

test("equal timestamps do not override a rev mismatch", () => {
  // Timestamps are advisory once revs exist; only the rev decides.
  const remote = { rev: 2, lastUpdated: NOW, schedule: {} };
  assert.equal(pushIsSafe(remote, 1, NOW), false);
});

// ── Persistence semantics ───────────────────────────────────────────────────
// null ("never pulled") and 0 ("pulled a pre-CAS document") drive different
// branches above, so the storage layer must keep them distinct.

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { getLocalBaseRev, writeLocalBaseRev, clearLocalBaseRev } =
  await import("@/lib/localMeta.ts");

test("an unset base rev reads as null, not 0", () => {
  store.clear();
  assert.equal(getLocalBaseRev("uid-a"), null);
});

test("a stored base rev of 0 reads back as 0", () => {
  store.clear();
  writeLocalBaseRev(0, "uid-a");
  assert.equal(getLocalBaseRev("uid-a"), 0);
});

test("base revs are scoped per account", () => {
  store.clear();
  writeLocalBaseRev(4, "uid-a");
  assert.equal(getLocalBaseRev("uid-b"), null);
  assert.equal(getLocalBaseRev(null), null); // guest
});

test("clearing removes it entirely rather than zeroing it", () => {
  store.clear();
  writeLocalBaseRev(9, "uid-a");
  clearLocalBaseRev("uid-a");
  assert.equal(getLocalBaseRev("uid-a"), null);
});

test("garbage in storage reads as unknown, not as rev 0", () => {
  store.clear();
  store.set("planr_baseRev:uid-a", "not-a-number");
  assert.equal(getLocalBaseRev("uid-a"), null);
});
