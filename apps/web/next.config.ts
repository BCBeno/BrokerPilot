import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Imagine Docker mică: `node server.js` din .next/standalone
  output: "standalone",
  // Monorepo: urmărește dependențele de la rădăcina repo-ului
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  // Doar pentru `next dev`: testarea de pe telefon (LAN sau tunel). Fără asta, Next blochează scripturile
  // cerute de pe altă origine decât localhost și butoanele nu fac nimic.
  allowedDevOrigins: ["192.168.*.*", "laptop-asus.tail483852.ts.net", "*.*.ts.net", "*.trycloudflare.com"],
};

export default nextConfig;
