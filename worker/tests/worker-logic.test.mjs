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
