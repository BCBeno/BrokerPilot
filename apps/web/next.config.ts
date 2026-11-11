import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Imagine Docker mică: `node server.js` din .next/standalone
  output: "standalone",
  // Monorepo: urmărește dependențele de la rădăcina repo-ului
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
};

export default nextConfig;
