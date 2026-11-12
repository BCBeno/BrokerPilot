import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Imagine Docker mică: `node server.js` din .next/standalone
  output: "standalone",
  // Monorepo: urmărește dependențele de la rădăcina repo-ului
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  // Antete de bază pe toate răspunsurile. Fără CSP deocamdată: Next + widgetul Vapi cer scripturi inline, iar un CSP neverificat strică demo-ul.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Wizardul folosește camera (acte, poze), locația (locul accidentului) și microfonul (apelul web cu Ana).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
  // Importul de portofoliu (CSV de max. 1 MB, verificat în acțiune) trece printr-un server action; implicit limita e 1 MB cu tot cu formular.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Doar pentru `next dev`: testarea de pe telefon (LAN sau tunel). Fără asta, Next blochează scripturile
  // cerute de pe altă origine decât localhost și butoanele nu fac nimic.
  allowedDevOrigins: ["192.168.*.*", "laptop-asus.tail483852.ts.net", "*.*.ts.net", "*.trycloudflare.com"],
};

export default nextConfig;
