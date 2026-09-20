/**
 * Does this VAPID keypair actually work?
 *
 * @block65/webcrypto-web-push builds ONE JWK out of both keys — x and y come
 * from the public key's bytes, d is the private key — and WebCrypto verifies
 * that d really is the scalar for that point. So a mismatched pair (rotated on
 * one side, pasted from different generations) fails with "Invalid keyData",
 * which is worded identically to a genuinely corrupt subscription. Before
 * worker/src/vapid.ts existed, that error also caused the cron to delete the
 * user's subscription.
 *
 * This runs the exact same import the library does, and reports which half is
 * wrong. It never prints, logs or transmits key material — only lengths and a
 * verdict.
 *
 * Usage, from worker/:
 *
 *   node scripts/check-vapid.mjs                 # reads .dev.vars (gitignored)
 *   VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node scripts/check-vapid.mjs
 */

import { readFileSync } from "node:fs";

function fromDevVars() {
  try {
    const out = {};
    for (const line of readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

const vars = { ...fromDevVars(), ...process.env };
const publicKey = vars.VAPID_PUBLIC_KEY;
const privateKey = vars.VAPID_PRIVATE_KEY;
const subject = vars.VAPID_SUBJECT;

const fail = (msg) => { console.error(`✗ ${msg}`); process.exitCode = 1; };

if (!publicKey || !privateKey) {
  fail("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be set (env, or worker/.dev.vars).");
  process.exit(1);
}

const decode = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ── Shape ────────────────────────────────────────────────────────────────────
// A VAPID public key is an uncompressed P-256 point: 65 bytes starting 0x04.
// The private key is the raw 32-byte scalar. web-push emits both base64url.
const pub = decode(publicKey);
const priv = decode(privateKey);

console.log(`public key : ${pub.length} bytes (want 65), first byte 0x${pub[0]?.toString(16).padStart(2, "0")} (want 0x04)`);
console.log(`private key: ${priv.length} bytes (want 32)`);
console.log(`subject    : ${subject ? "set" : "MISSING — required"}`);

if (pub.length !== 65 || pub[0] !== 0x04) {
  fail("Public key is not an uncompressed P-256 point. Regenerate with: npx web-push generate-vapid-keys");
}
if (priv.length !== 32) {
  fail("Private key is not a 32-byte P-256 scalar. Regenerate with: npx web-push generate-vapid-keys");
}
if (process.exitCode === 1) process.exit(1);

// ── The real test: the same import the library performs ──────────────────────
try {
  await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
      d: privateKey,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  console.log("\n✓ The keypair matches. VAPID is not your problem.");
  if (!subject) fail("...but VAPID_SUBJECT is missing, and the library requires it.");
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  console.error(
    "\nThe private key is not the scalar for that public point — these are from\n" +
    "two different keypairs. Generate a fresh pair and set BOTH sides:\n\n" +
    "  npx web-push generate-vapid-keys\n" +
    "  cd worker && npx wrangler secret put VAPID_PUBLIC_KEY\n" +
    "  cd worker && npx wrangler secret put VAPID_PRIVATE_KEY\n\n" +
    "Then put the SAME public key in the web app's NEXT_PUBLIC_VAPID_PUBLIC_KEY\n" +
    "and rebuild — it is baked in at build time. Existing subscriptions were\n" +
    "made against the old public key and must be recreated (toggle Reminders\n" +
    "off and on) once both sides agree.",
  );
  process.exitCode = 1;
}
