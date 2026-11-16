import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createRateLimiter, sniffMime } from "@/lib/ai/upload";
import { getBrokerOrNull } from "@/lib/broker/session";
import {
  BROKER_FILE_EXT,
  CLAIM_BUCKET,
  MAX_BROKER_FILES_PER_CLAIM,
  MAX_BROKER_FILE_BYTES,
  brokerFilePath,
  cleanFileName,
} from "@/lib/claims/files";
import { NOT_CONFIGURED, NOT_FOUND, SERVER_ERROR, TOO_MANY, fail } from "@/lib/claims/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const allow = createRateLimiter(60, 10 * 60_000);
const forSchema = z.enum(["A", "B", "doc"]);

/**
 * Brokerul adaugă la dosar o poză sau un PDF primit mai târziu (câmpurile `file` și `for`: „A”, „B” sau „doc”).
 * O poză pentru A/B intră la pozele cu daune ale șoferului; un PDF sau o poză „pentru dosar” intră la documente.
 * Datele semnate și PDF-ul amiabilei nu se schimbă. Accesul la dosar îl decide RLS (agenția brokerului);
 * scrierea în Storage și în `claim_files` merge apoi cu service_role.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getBrokerOrNull();
  if (!session) return fail(401, "Autentificați-vă ca broker.", "unauthorized");
  if (!allow(session.broker.id)) return TOO_MANY();
  const admin = getAdminClient();
  if (!admin) return NOT_CONFIGURED();

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NOT_FOUND();
  const claim = await session.db.from("claims").select("id").eq("id", id).maybeSingle();
  if (claim.error) return SERVER_ERROR();
  if (!claim.data) return NOT_FOUND();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const target = forSchema.safeParse(form?.get("for"));
  if (!(file instanceof File) || !target.success) return fail(400, "Alegeți fișierul și pentru cine e.", "bad_request");
  if (file.size === 0 || file.size > MAX_BROKER_FILE_BYTES) return fail(413, "Fișierul e gol sau depășește 10 MB.", "too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return fail(415, "Acceptăm doar poze (JPEG, PNG, WebP) și PDF.", "bad_type");

  const count = await admin
    .from("claim_files")
    .select("id", { count: "exact", head: true })
    .eq("claim_id", id)
    .not("uploaded_by", "is", null);
  if (count.error) return SERVER_ERROR();
  if ((count.count ?? 0) >= MAX_BROKER_FILES_PER_CLAIM) {
    return fail(422, `Un dosar poate avea cel mult ${MAX_BROKER_FILES_PER_CLAIM} fișiere adăugate de broker.`, "too_many");
  }

  const role = target.data === "doc" ? null : target.data;
  const kind = mime !== "application/pdf" && role ? "damage" : "document";
  const fileId = randomUUID();
  const path = brokerFilePath(id, fileId, BROKER_FILE_EXT[mime]);
  const up = await admin.storage.from(CLAIM_BUCKET).upload(path, bytes, { contentType: mime });
  if (up.error) return SERVER_ERROR();
  const row = await admin.from("claim_files").insert({
    id: fileId,
    claim_id: id,
    party_role: role,
    kind,
    storage_path: path,
    uploaded_by: session.broker.id,
    file_name: cleanFileName(file.name),
  });
  if (row.error) {
    await admin.storage.from(CLAIM_BUCKET).remove([path]);
    return SERVER_ERROR();
  }
  revalidatePath("/broker", "layout");
  return NextResponse.json({ id: fileId, kind }, { status: 201 });
}
