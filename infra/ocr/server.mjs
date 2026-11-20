// psm 4 (o coloană, rânduri de mărimi diferite) păstrează „Etichetă: valoare” pe același rând; psm 3 le desparte în blocuri.
// Server OCR minimal, fără dependențe. POST /ocr cu fișierul ca trup brut (JPEG, PNG sau PDF) → { pages: [{ page, text }] }.
// Securitate: cere `x-bp-secret` (OCR_SECRET) dacă e setat; argumentele merg prin execFile (fără shell); limită de mărime, de pagini și de timp.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.OCR_SECRET ?? "";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = Number(process.env.OCR_MAX_PAGES ?? 5);
const PAGE_TIMEOUT_MS = 45_000;
const DPI = 200;

// Un singur OCR la un moment dat: Tesseract e legat de CPU, iar LXC-ul are puține nuclee.
let chain = Promise.resolve();
const exclusive = (fn) => {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
};

function sniff(bytes) {
  const at = (sig) => sig.every((b, i) => bytes[i] === b);
  if (at([0xff, 0xd8, 0xff])) return "jpg";
  if (at([0x89, 0x50, 0x4e, 0x47])) return "png";
  if (at([0x25, 0x50, 0x44, 0x46])) return "pdf";
  return null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw Object.assign(new Error("too_large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function ocrImage(path) {
  const { stdout } = await run("tesseract", [path, "stdout", "-l", "ron+eng", "--oem", "1", "--psm", "4"], {
    timeout: PAGE_TIMEOUT_MS,
    maxBuffer: 5 * 1024 * 1024,
  });
  return stdout.replace(/\r/g, "").trim();
}

async function ocrFile(bytes, kind) {
  const dir = await mkdtemp(join(tmpdir(), "ocr-"));
  try {
    const images = [];
    if (kind === "pdf") {
      await writeFile(join(dir, "in.pdf"), bytes);
      await run("pdftoppm", ["-r", String(DPI), "-l", String(MAX_PAGES), "-png", join(dir, "in.pdf"), join(dir, "p")], { timeout: 60_000 });
      const files = (await readdir(dir)).filter((f) => f.startsWith("p-") && f.endsWith(".png")).sort();
      images.push(...files.map((f) => join(dir, f)));
    } else {
      const path = join(dir, `in.${kind}`);
      await writeFile(path, bytes);
      images.push(path);
    }
    const pages = [];
    for (const [i, img] of images.entries()) pages.push({ page: i + 1, text: await ocrImage(img) });
    return pages;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/ocr") return send(res, 404, { error: "not_found" });
    if (SECRET && req.headers["x-bp-secret"] !== SECRET) return send(res, 401, { error: "unauthorized" });

    const bytes = await readBody(req);
    const kind = sniff(bytes);
    if (!kind) return send(res, 415, { error: "unsupported_type" });

    const pages = await exclusive(() => ocrFile(bytes, kind));
    return send(res, 200, { pages });
  } catch (err) {
    const status = err?.status ?? 500;
    console.error("[ocr]", err?.message ?? err);
    return send(res, status, { error: status === 413 ? "too_large" : "ocr_failed" });
  }
}).listen(PORT, () => console.log(`[ocr] ascult pe :${PORT}`));
