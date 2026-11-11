import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

/**
 * Cheie scurtă pentru pagina pe care o randează Chromium (`/amiabila/pdf/<id>?k=...`). Pagina conține datele personale
 * ale dosarului, deci nu e publică: cheia e semnată cu secretul serverului și expiră în 5 minute.
 */
const KEY_TTL_MS = 5 * 60_000;

const sign = (claimId: string, exp: number, secret: string) =>
  createHmac("sha256", secret).update(`pdf:${claimId}:${exp}`).digest("base64url");

export function makeRenderKey(claimId: string, secret: string, now = Date.now()): string {
  const exp = now + KEY_TTL_MS;
  return `${exp}.${sign(claimId, exp, secret)}`;
}

export function verifyRenderKey(claimId: string, key: string | undefined, secret: string, now = Date.now()): boolean {
  const m = key ? /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(key) : null;
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = Buffer.from(sign(claimId, exp, secret));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/** `CHROME_PATH` din `.env`, altfel primul browser găsit în locurile uzuale. */
export function findChrome(configured = process.env.CHROME_PATH): string | null {
  if (configured) return configured;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export class PdfUnavailableError extends Error {}

// Chromium consumă memorie; randările rulează una după alta.
let queue: Promise<unknown> = Promise.resolve();

/** Randează o pagină (A4, culorile păstrate, mărimea foii din CSS) în PDF. */
export function renderPdf(url: string): Promise<Uint8Array> {
  const run = async () => {
    const executablePath = findChrome();
    if (!executablePath) throw new PdfUnavailableError("Nu am găsit Chromium (setați CHROME_PATH).");
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage();
      const res = await page.goto(url, { waitUntil: "networkidle0", timeout: 45_000 });
      if (!res?.ok()) throw new Error(`Pagina PDF a răspuns ${res?.status() ?? "fără răspuns"}`);
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({ preferCSSPageSize: true, printBackground: true });
    } finally {
      await browser.close();
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Adresa locală a aplicației, pe care o deschide Chromium din același container. */
export const internalBaseUrl = () => `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
