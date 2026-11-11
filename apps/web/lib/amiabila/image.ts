/** Pregătirea pozei pe telefon, înainte de upload: orientare corectă din EXIF și redimensionare (poze de 10 MB devin ~300 KB). */

const MAX_SIDE = 1800;

export async function prepareUpload(file: File): Promise<File> {
  if (file.type === "application/pdf" || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "act.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}
