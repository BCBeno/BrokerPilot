import { extractText, getDocumentProxy } from "unpdf";

/** Un document din baza de cunoștințe, pe pagini: pagina e folosită la citări ([document, pag. N]). */
export type KbPage = { page: number; text: string };
export type ParsedKbFile = { pages: KbPage[]; totalPages: number };

/** Documentele publice (condiții generale de asigurare) au zeci de pagini, dar rar peste câțiva MB. */
export const MAX_KB_FILE_BYTES = 20 * 1024 * 1024;

export class KbParseError extends Error {
  constructor(
    readonly code: "unsupported" | "unreadable",
    message: string,
  ) {
    super(message);
  }
}

const CEDILLA_TO_COMMA: Record<string, string> = { "ş": "ș", "Ş": "Ș", "ţ": "ț", "Ţ": "Ț" };

/**
 * Curăță textul extras: multe PDF-uri românești folosesc ş/ţ cu sedilă (U+015F/U+0163) în loc de ș/ț cu virgulă (U+0219/U+021B).
 * Căutarea full-text și întrebările utilizatorilor folosesc forma corectă, deci fără normalizare nu s-ar potrivi.
 */
export function normalizeRo(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[şŞţŢ]/g, (c) => CEDILLA_TO_COMMA[c] ?? c)
    .replace(/\u0000/g, "")
    .replace(/­/g, "") // cratimă moale
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isPdf = (bytes: Uint8Array) =>
  bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d; // "%PDF-"

const looksBinary = (bytes: Uint8Array) => bytes.subarray(0, 2000).includes(0);

async function parsePdf(bytes: Uint8Array): Promise<ParsedKbFile> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { totalPages, pages: text.map((t, i) => ({ page: i + 1, text: normalizeRo(t) })).filter((p) => p.text.length > 0) };
  } catch {
    throw new KbParseError("unreadable", "PDF-ul nu a putut fi citit.");
  }
}

/** Text simplu (de exemplu un Google Doc exportat ca text): o singură pagină, sau pagini separate prin „form feed”. */
function parseText(bytes: Uint8Array): ParsedKbFile {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
  const parts = raw.split("\f");
  const pages = parts.map((t, i) => ({ page: i + 1, text: normalizeRo(t) })).filter((p) => p.text.length > 0);
  return { totalPages: parts.length, pages };
}

/** Citește un fișier din baza de cunoștințe (PDF sau text) și îl întoarce pe pagini. DOCX și imaginile nu sunt acceptate. */
export async function parseKbFile(bytes: Uint8Array): Promise<ParsedKbFile> {
  if (isPdf(bytes)) return parsePdf(bytes);
  if (bytes.length === 0 || looksBinary(bytes)) throw new KbParseError("unsupported", "Sunt acceptate doar PDF și text.");
  return parseText(bytes);
}
