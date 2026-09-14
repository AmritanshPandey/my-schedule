import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true, // required for static export
  },
  turbopack: {
    // Pin the workspace root to this project. Without it Next walks up looking
    // for a lockfile, finds the stray one in the parent directory that sits
    // above several unrelated sibling projects, and resolves modules from
    // there — which breaks `npm run dev` with "Can't resolve 'tailwindcss'",
    // since that directory has no node_modules. Turbopack (the Next 16
    // default) handles Web Workers natively, so nothing else is needed here.
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
