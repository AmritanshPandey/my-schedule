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

const { base64url, base64urlDecode } = await import("../src/base64url.ts");
const { isVapidFailure, vapidConfigProblem } = await import("../src/vapid.ts");

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

// checkAndIncrement (worker/src/usage.ts) and validateClaims
// (worker/src/auth.ts) were tested here — both files are gone along with the
// Gemini AI proxy they backed (POST /ai/chat, a shared API key with
// per-user/global daily caps). AI now runs on a local MLX model the browser
// talks to directly; there's no shared key or auth boundary left to guard.

// ── Failure attribution ──────────────────────────────────────────────────────
//
// Every VAPID problem surfaces as a throw from `buildPushPayload`, exactly like
// genuinely corrupt subscription keys. The cron handler's response to a bad
// subscription is to DELETE it from Firestore, so collapsing the two meant one
// missing Worker secret silently destroyed every user's working subscription,
// once a minute, for a problem no user could fix. These pin the split.

test("VAPID failures are recognised as ours, not the subscription's", () => {
  // The exact strings @block65/webcrypto-web-push produces.
  for (const message of [
    "Vapid private key is empty",
    "Vapid subject is empty",
    "vapid public key is empty",
  ]) {
    assert.equal(isVapidFailure(message), true, message);
  }
});

test("a genuinely broken subscription is not mistaken for a config problem", () => {
  for (const message of [
    "Invalid keyData",
    "Invalid EC key in JSON Web Key",
    "The provided value is not of type 'ArrayBuffer'",
  ]) {
    assert.equal(isVapidFailure(message), false, message);
  }
});

test("a missing secret is named specifically, so the log says which one", () => {
  const full = { subject: "mailto:a@b.c", publicKey: "pub", privateKey: "priv" };
  assert.equal(vapidConfigProblem(full), null);
  assert.match(vapidConfigProblem({ ...full, subject: "" }), /VAPID_SUBJECT/);
  assert.match(vapidConfigProblem({ ...full, publicKey: "" }), /VAPID_PUBLIC_KEY/);
  assert.match(vapidConfigProblem({ ...full, privateKey: "" }), /VAPID_PRIVATE_KEY/);
});

test("an undefined secret counts as missing, not as configured", () => {
  // Unset Worker secrets arrive as undefined, not "".
  const problem = vapidConfigProblem({ subject: undefined, publicKey: undefined, privateKey: undefined });
  assert.ok(problem, "an entirely unconfigured Worker must report a problem");
});
