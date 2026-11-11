/** Reguli pentru fișierele unui dosar: pozele cu daune, semnăturile și schița. Funcții pure, fără acces la rețea. */

export const CLAIM_BUCKET = "claim-files";

/** Câte poze cu daune poate încărca un șofer. */
export const MAX_PHOTOS_PER_PARTY = 8;
/** O poză comprimată pe client are în jur de 150–400 KB; peste limită o respingem. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
/** Semnătura e un PNG mic desenat pe canvas. */
export const MAX_SIGNATURE_BYTES = 200 * 1024;

export type Role = "A" | "B";

export const photoPath = (claimId: string, role: Role, fileId: string) => `claims/${claimId}/photo-${role}-${fileId}.jpg`;
export const signaturePath = (claimId: string, role: Role) => `claims/${claimId}/signature-${role}.png`;
export const sketchPath = (claimId: string) => `claims/${claimId}/sketch.json`;
export const pdfPath = (claimId: string) => `claims/${claimId}/constatare.pdf`;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Primii octeți ai unui JPEG. */
export const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/**
 * Semnătura vine ca `data:image/png;base64,...`. Întoarce octeții PNG sau `null` dacă formatul, mărimea
 * sau antetul nu sunt cele așteptate (nu ne încredem în ce declară clientul).
 */
export function parseSignature(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m || m[1].length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 4) return null;
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES) return null;
  return PNG_MAGIC.every((b, i) => bytes[i] === b) ? bytes : null;
}

export const toDataUrl = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
