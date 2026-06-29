// Injects the entry chunk URLs from the exported index.html into the built
// service worker's PRECACHE_ASSETS list, so a cold/offline launch can paint the
// app shell without a network round-trip for its critical scripts.
//
// Runs as `postbuild` against the `out/` static export. Because this rewrites
// out/sw.js with the current build's hashed chunk names, the SW byte content
// changes whenever the entry chunks change — which makes the browser pick up the
// new service worker automatically on the next visit.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = "out";
const HTML = join(OUT_DIR, "index.html");
const SW = join(OUT_DIR, "sw.js");

async function main() {
  let html;
  try {
    html = await readFile(HTML, "utf8");
  } catch {
    console.warn(`[inject-precache] ${HTML} not found — skipping (no static export?).`);
    return;
  }

  // Collect both <script src> and <link href> references to JS entry chunks.
  const urls = new Set();
  const re = /(?:src|href)="(\/_next\/static\/[^"]+\.js)"/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.add(m[1]);

  const list = [...urls].sort();
  if (list.length === 0) {
    console.warn("[inject-precache] No entry chunks found in index.html — skipping.");
    return;
  }

  let sw = await readFile(SW, "utf8");
  const replacement = `const PRECACHE_ASSETS = ${JSON.stringify(list, null, 2)};`;
  let next = sw.replace(/const PRECACHE_ASSETS = \[[^\]]*\];/, replacement);

  if (next === sw) {
    console.warn("[inject-precache] PRECACHE_ASSETS placeholder not found in sw.js — skipping.");
    return;
  }

  // Stamp CACHE_VERSION with this build's id so every deploy gets fresh cache
  // names; the SW's activate handler then purges the previous build's caches,
  // preventing a stale app shell from requesting chunks this build removed.
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || `t${Date.now()}`;
  const versioned = next.replace(
    /const CACHE_VERSION = '[^']*';/,
    `const CACHE_VERSION = 'planr-${buildId}';`
  );
  if (versioned === next) {
    console.warn("[inject-precache] CACHE_VERSION placeholder not found in sw.js — version not stamped.");
  }
  next = versioned;

  await writeFile(SW, next);
  console.log(`[inject-precache] Injected ${list.length} entry chunk(s) and stamped CACHE_VERSION=planr-${buildId} into ${SW}.`);
}

main().catch((err) => {
  console.error("[inject-precache] Failed:", err);
  process.exit(1);
});
