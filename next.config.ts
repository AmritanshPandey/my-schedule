import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true, // required for static export
  },
  // Turbopack (Next.js 16 default) handles Web Workers natively.
  // Empty config silences the "webpack config present" warning.
  turbopack: {},
};

export default nextConfig;
