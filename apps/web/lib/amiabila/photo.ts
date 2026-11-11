import { MAX_PHOTO_CHARS, PHOTO_MAX_SIDE, PHOTO_QUALITY, fitWithin } from "./sketch";

/**
 * Micșorează și comprimă poza unei schițe, pe client, ca să încapă în ciornă (localStorage) și să nu încarce rețeaua.
 * Respectă orientarea din EXIF (pozele de pe telefon vin adesea rotite). Doar în browser.
 */
async function load(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* continuăm cu elementul <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not-an-image");
  const img = await load(file);
  try {
    // Prima încercare la mărimea țintă; dacă tot e prea mare, mai coborâm o dată.
    for (const [side, quality] of [
      [PHOTO_MAX_SIDE, PHOTO_QUALITY],
      [700, 0.6],
    ] as const) {
      const { width, height } = fitWithin(img.width, img.height, side);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img.source, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_PHOTO_CHARS) return dataUrl;
    }
    throw new Error("too-large");
  } finally {
    img.close();
  }
}
