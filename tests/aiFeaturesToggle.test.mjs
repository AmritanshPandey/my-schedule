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
// reads fall through to defaults, which would make these tests pass for the
// wrong reason. Set before importing config so the module sees it.
const store = new Map();
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = {
  localStorage: localStorageStub,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = localStorageStub;

const {
  getAIFeaturesEnabled,
  setAIFeaturesEnabled,
  getAIProviderState,
  setActiveProvider,
  migrateBrowserModel,
} = await import("@/lib/ai/config.ts");

// Guard against the stub silently regressing to a no-op.
test("sanity: the localStorage stub is actually wired to window", () => {
  store.clear();
  setAIFeaturesEnabled(false);
  assert.equal(store.get("planr:ai:features-enabled"), "0", "write did not reach the stub");
});


test("AI features default to on when the user has never chosen", () => {
  store.clear();
  assert.equal(getAIFeaturesEnabled(), true);
});

test("turning AI off persists, and turning it back on persists", () => {
  store.clear();
  setAIFeaturesEnabled(false);
  assert.equal(getAIFeaturesEnabled(), false);
  setAIFeaturesEnabled(true);
  assert.equal(getAIFeaturesEnabled(), true);
});

test("only an explicit off reads as disabled — a junk value stays enabled", () => {
  store.clear();
  store.set("planr:ai:features-enabled", "maybe");
  assert.equal(getAIFeaturesEnabled(), true);
});

// ── Default provider ────────────────────────────────────────────────────────
// Browser AI is the only provider that works with nothing installed, so it is
// what a fresh install gets.

test("a fresh install defaults to the in-browser provider", () => {
  store.clear();
  assert.equal(getAIProviderState().active, "browser");
  assert.equal(getAIProviderState().browser.model, "onnx-community/gemma-3-1b-it-ONNX-GQA");
});

test("an existing provider choice survives the default change", () => {
  store.clear();
  setActiveProvider("ollama");
  assert.equal(getAIProviderState().active, "ollama");
});

// ── Withdrawn model ids ─────────────────────────────────────────────────────
// The browser model id is persisted per device, so when onnx-community
// re-published its ports under `-ONNX` names the old id kept being read back
// from storage and every load failed with a 401 from the Hub. Changing the
// default alone does not reach a device that already saved one.

test("a saved but withdrawn browser model id is rewritten to its replacement", () => {
  store.clear();
  store.set("planr:ai:provider-state", JSON.stringify({
    active: "browser",
    browser: { baseUrl: "", model: "onnx-community/SmolLM2-360M-Instruct" },
  }));
  assert.equal(getAIProviderState().browser.model, "onnx-community/SmolLM2-360M-Instruct-ONNX");
});

test("a model the user typed themselves is never rewritten", () => {
  store.clear();
  store.set("planr:ai:provider-state", JSON.stringify({
    active: "browser",
    browser: { baseUrl: "", model: "my-org/my-own-model" },
  }));
  assert.equal(getAIProviderState().browser.model, "my-org/my-own-model");
});

test("the default browser model is not one of the withdrawn ids", () => {
  store.clear();
  const { model } = getAIProviderState().browser;
  assert.equal(migrateBrowserModel(model), model, "the default itself needs migrating");
});

test("the AI switch and the provider choice are independent", () => {
  store.clear();
  setActiveProvider("mlx");
  setAIFeaturesEnabled(false);
  // Turning AI off must not silently reset which provider they picked.
  assert.equal(getAIProviderState().active, "mlx");
  setAIFeaturesEnabled(true);
  assert.equal(getAIProviderState().active, "mlx");
});
