/**
 * Coverage for lib/ai/rejectionContext.ts — an on-device-only record of
 * recently-rejected AI proposal titles, fed back into future prompts.
 *
 * Deliberately NOT part of schedule.events (see tests/proposal.test.mjs's
 * "AI_PROPOSAL_* events only ever carry whitelisted metadata, never raw AI
 * text" — schedule.events is shared/synced and has an explicit boundary
 * against carrying free text). This is why the module has its own storage
 * instead of reading events back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      try {
        return nextResolve(url, context);
      } catch {
        return nextResolve(`${url}.ts`, context);
      }
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        return nextResolve(`${new URL(specifier, context.parentURL).href}.ts`, context);
      }
      throw error;
    }
  },
});

// lib/safeStorage reads `window.localStorage` specifically — not the global —
// so the stub has to hang off `window` or every write silently no-ops and the
// reads fall through to defaults. Same pattern as tests/aiFeaturesToggle.test.mjs.
const store = new Map();
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = { localStorage: localStorageStub };
globalThis.localStorage = localStorageStub;

const { recordRejectedProposal, getRecentRejectionTitles } = await import("@/lib/ai/rejectionContext.ts");

test("no rejections recorded yet → empty list", () => {
  store.clear();
  assert.deepEqual(getRecentRejectionTitles(), []);
});

test("records round-trip and read back most-recent-first", async () => {
  store.clear();
  recordRejectedProposal("Create task: Morning Run");
  await new Promise((r) => setTimeout(r, 2)); // distinct Date.now() ticks
  recordRejectedProposal("Create task: Evening Walk");
  assert.deepEqual(getRecentRejectionTitles(), ["Create task: Evening Walk", "Create task: Morning Run"]);
});

test("respects the limit", async () => {
  store.clear();
  for (const t of ["A", "B", "C", "D"]) {
    recordRejectedProposal(t);
    await new Promise((r) => setTimeout(r, 2));
  }
  assert.deepEqual(getRecentRejectionTitles(2), ["D", "C"]);
});

test("default limit is 3", async () => {
  store.clear();
  for (const t of ["A", "B", "C", "D", "E"]) {
    recordRejectedProposal(t);
    await new Promise((r) => setTimeout(r, 2));
  }
  assert.deepEqual(getRecentRejectionTitles(), ["E", "D", "C"]);
});

test("an empty or whitespace-only title is not recorded", () => {
  store.clear();
  recordRejectedProposal("");
  recordRejectedProposal("   ");
  assert.deepEqual(getRecentRejectionTitles(), []);
});

test("tolerates corrupted storage instead of throwing", () => {
  store.set("planr:ai:recent-rejections", "not valid json{{{");
  assert.deepEqual(getRecentRejectionTitles(), []);
});
