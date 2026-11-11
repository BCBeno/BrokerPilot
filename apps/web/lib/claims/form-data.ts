import type { SupabaseClient } from "@supabase/supabase-js";
import { documentsFromColumns, type PartySubmission } from "@/lib/amiabila/claim";
import { EMPTY_DRAFT, draftSchema } from "@/lib/amiabila/draft";
import { buildForm, type FormData } from "@/lib/amiabila/form";
import { sketchSchema, type Sketch } from "@/lib/amiabila/sketch";
import type { CompletenessInput } from "./completeness";
import { CLAIM_BUCKET, sketchPath, toDataUrl, type Role } from "./files";

export type AnnexPhoto = { role: Role; src: string };

export type ClaimDocument = {
  ref: string;
  status: string;
  channel: string;
  form: FormData;
  photos: AnnexPhoto[];
  /** Faptele pentru checklistul de completitudine. */
  facts: CompletenessInput;
};

type PartyRow = {
  role: Role;
  driver: Record<string, unknown> | null;
  vehicle: Record<string, unknown> | null;
  insurance: Record<string, unknown> | null;
  extraction_confidence: Record<string, unknown> | null;
  signature_path: string | null;
};

async function readBytes(db: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const { data, error } = await db.storage.from(CLAIM_BUCKET).download(path);
  return error || !data ? null : new Uint8Array(await data.arrayBuffer());
}

async function readSketch(db: SupabaseClient, claimId: string): Promise<Sketch | null> {
  const bytes = await readBytes(db, sketchPath(claimId));
  if (!bytes) return null;
  try {
    const parsed = sketchSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Tot ce intră în formular, citit de pe server: locul, datele celor doi șoferi, schița, semnăturile și pozele.
 * Folosit de pagina pe care Chromium o transformă în PDF și de finalizare (checklist). `null` = dosarul nu există.
 */
export async function loadClaimDocument(db: SupabaseClient, claimId: string): Promise<ClaimDocument | null> {
  const [claimRes, partiesRes, filesRes] = await Promise.all([
    db
      .from("claims")
      .select("public_ref, status, channel, accident_at, location_text, lat, lng, eligibility, circumstances_a, circumstances_b")
      .eq("id", claimId)
      .maybeSingle(),
    db.from("claim_parties").select("role, driver, vehicle, insurance, extraction_confidence, signature_path").eq("claim_id", claimId),
    db.from("claim_files").select("storage_path, party_role, kind").eq("claim_id", claimId).order("created_at"),
  ]);
  const claim = claimRes.data;
  if (claimRes.error || partiesRes.error || filesRes.error || !claim) return null;

  const parties = (partiesRes.data ?? []) as PartyRow[];
  const rowA = parties.find((p) => p.role === "A");
  const rowB = parties.find((p) => p.role === "B");
  const files = filesRes.data ?? [];

  const circumstancesA = draftSchema.shape.circumstances.safeParse(claim.circumstances_a);
  const circumstancesB = draftSchema.shape.circumstances.safeParse(claim.circumstances_b);
  const eligibility = draftSchema.shape.eligibility.safeParse(claim.eligibility);
  const docsA = rowA ? documentsFromColumns(rowA) : null;
  const docsB = rowB ? documentsFromColumns(rowB) : null;

  const partyA: PartySubmission | null = docsA && circumstancesA.success ? { documents: docsA, circumstances: circumstancesA.data } : null;
  const partyB: PartySubmission | null = docsB && circumstancesB.success ? { documents: docsB, circumstances: circumstancesB.data } : null;
  const sketch = files.some((f) => f.kind === "sketch") ? await readSketch(db, claimId) : null;

  const draft = {
    ...EMPTY_DRAFT,
    injured: false,
    eligibility: eligibility.success ? eligibility.data : EMPTY_DRAFT.eligibility,
    place: { ...EMPTY_DRAFT.place, address: claim.location_text ?? "", lat: claim.lat, lng: claim.lng, occurredAt: claim.accident_at },
    documents: docsA ?? EMPTY_DRAFT.documents,
    circumstances: circumstancesA.success ? circumstancesA.data : EMPTY_DRAFT.circumstances,
    sketch,
  };
  const form = buildForm(draft, partyB);

  const signature = async (row: PartyRow | undefined) => {
    const bytes = row?.signature_path ? await readBytes(db, row.signature_path) : null;
    return bytes ? toDataUrl(bytes, "image/png") : null;
  };
  const [sigA, sigB] = await Promise.all([signature(rowA), signature(rowB)]);
  form.a.signature = sigA;
  form.b.signature = sigB;

  const damage = files.filter((f) => f.kind === "damage");
  const signed = damage.length
    ? await db.storage.from(CLAIM_BUCKET).createSignedUrls(
        damage.map((f) => f.storage_path as string),
        600,
      )
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const photos: AnnexPhoto[] = damage.flatMap((f) => {
    const src = urls.get(f.storage_path as string);
    return src ? [{ role: f.party_role as Role, src }] : [];
  });

  return {
    ref: claim.public_ref,
    status: claim.status,
    channel: claim.channel,
    form,
    photos,
    facts: {
      partyA,
      partyB,
      photosA: damage.filter((f) => f.party_role === "A").length,
      photosB: damage.filter((f) => f.party_role === "B").length,
      hasSketch: sketch !== null,
      signedA: sigA !== null,
      signedB: sigB !== null,
    },
  };
}
