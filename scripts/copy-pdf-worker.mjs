// Copies the pdf.js worker into public/ so it is served same-origin instead of
// from a third-party CDN (unpkg). A CDN worker fails silently when the network
// blocks it — common in an installed iOS PWA / offline — leaving the PDF reader
// stuck with no pages and no error. Self-hosting also lets the service worker
// cache it (public/ assets are cache-first), so the reader works offline.
//
// Runs on `predev` and `prebuild` so the file always matches the installed
// pdfjs-dist version; the destination is git-ignored generated output.

import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Resolve the worker that the installed pdfjs-dist (re-exported by react-pdf) ships.
const workerSrc = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = join(projectRoot, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

mkdirSync(destDir, { recursive: true });
copyFileSync(workerSrc, dest);

const { version } = require("pdfjs-dist/package.json");
console.log(`[copy-pdf-worker] Copied pdf.js worker v${version} → public/pdf.worker.min.mjs`);
