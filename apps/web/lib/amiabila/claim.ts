import { z } from "zod";
import { draftSchema } from "./draft";
import { DOC_META, DOC_TYPES, isDocConfirmed, type DocType, type ExtractedDoc } from "./documents";
import { sketchSchema } from "./sketch";

/** Cât timp e valabil linkul pentru șoferul B. */
export const JOIN_TTL_MS = 2 * 60 * 60_000;

/** Ce trimite un șofer: actele verificate și circumstanțele lui. */
export const partySubmissionSchema = z.object({
  documents: draftSchema.shape.documents,
  circumstances: draftSchema.shape.circumstances,
});
export type PartySubmission = z.infer<typeof partySubmissionSchema>;

/** Ce trimite A la crearea dosarului, la pasul „Șofer B”: locul, momentul și actele. Circumstanțele lui A vin mai târziu (PATCH). */
export const createClaimSchema = z.object({
  documents: draftSchema.shape.documents,
  eligibility: draftSchema.shape.eligibility,
  place: z.object({
    address: z.string().trim().min(3).max(300),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    occurredAt: z.iso.datetime(),
  }),
});
export type CreateClaim = z.infer<typeof createClaimSchema>;

/** Serverul nu are încredere în client: aceleași reguli ca „Continuă” din wizard. `null` = totul e în regulă. */
export function documentsProblem(documents: PartySubmission["documents"]): string | null {
  for (const t of DOC_TYPES) {
    if (!isDocConfirmed(t, documents[t])) return "Actele nu sunt complete sau verificate.";
  }
  return null;
}

export function submissionProblem(s: PartySubmission): string | null {
  const docs = documentsProblem(s.documents);
  if (docs) return docs;
  if (s.circumstances.checked.length === 0) return "Bifați cel puțin o circumstanță.";
  if (s.circumstances.impact === null) return "Alegeți zona lovită.";
  return null;
}

const values = (doc: ExtractedDoc | null) =>
  Object.fromEntries(Object.entries(doc?.fields ?? {}).map(([k, f]) => [k, f.value]));
const confidences = (doc: ExtractedDoc | null) =>
  Object.fromEntries(Object.entries(doc?.fields ?? {}).map(([k, f]) => [k, f.confidence]));

/** Actele șoferului, pe coloanele din `claim_parties`. */
export function partyColumns(documents: PartySubmission["documents"]) {
  return {
    driver: values(documents.license),
    vehicle: values(documents.registration),
    insurance: values(documents.policy),
    extraction_confidence: {
      registration: confidences(documents.registration),
      license: confidences(documents.license),
      policy: confidences(documents.policy),
    },
  };
}

/** Ce poate actualiza A după ce dosarul există (a modificat actele sau a completat circumstanțele). */
export const claimPatchSchema = z.object({
  circumstances: draftSchema.shape.circumstances.optional(),
  documents: draftSchema.shape.documents.optional(),
  /** Schița lui A (caseta 13). `null` = a șters-o. */
  sketch: sketchSchema.nullable().optional(),
  /** Acordul GDPR al lui A din rezumat; serverul pune ora la prima bifare. */
  contactConsent: z.boolean().optional(),
});

/** Coloana din `claim_parties` în care se păstrează valorile fiecărui act. */
export const PARTY_COLUMN: Record<DocType, "vehicle" | "driver" | "insurance"> = {
  registration: "vehicle",
  license: "driver",
  policy: "insurance",
};

type Row = Record<string, unknown> | null;

/** Inversul lui `partyColumns`: actele șoferului B, refăcute din ce s-a salvat, ca să se completeze formularul. `null` = B nu a trimis încă. */
export function documentsFromColumns(row: {
  driver: Row;
  vehicle: Row;
  insurance: Row;
  extraction_confidence: Row;
}): PartySubmission["documents"] | null {
  if (row.driver === null) return null; // `driver` e setat doar când B trimite
  const conf = (row.extraction_confidence ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const build = (type: DocType): ExtractedDoc => {
    const values = (row[PARTY_COLUMN[type]] ?? {}) as Record<string, unknown>;
    return {
      fields: Object.fromEntries(
        DOC_META[type].fields.map((f) => {
          const v = values[f.key];
          const c = conf[type]?.[f.key];
          return [f.key, { value: typeof v === "string" ? v : null, confidence: typeof c === "number" ? c : 0 }];
        }),
      ),
    };
  };
  return { registration: build("registration"), license: build("license"), policy: build("policy") };
}

/** Datele lui B pentru formularul lui A. */
export type PartyBResponse = { submitted: false } | ({ submitted: true } & PartySubmission);

/** Starea dosarului văzută de A (fără date personale ale lui B). */
export type ClaimStatus = {
  status: string;
  bSubmitted: boolean;
  joinExpiresAt: string | null;
  signedA: boolean;
  signedB: boolean;
  /** PDF-ul a fost generat (dosarul e trimis). */
  pdfReady: boolean;
};

/** Ce vede B înainte să înceapă: doar locul și momentul. */
export type JoinInfo = { claimId: string; ref: string; address: string; occurredAt: string | null };

export function isExpired(expiresAt: string | null, now: Date): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() <= now.getTime();
}

/** Canalul Realtime Broadcast al dosarului. Mesajele nu conțin date personale, doar semnale. */
export const claimChannel = (claimId: string) => `claim:${claimId}`;
export const BROADCAST_B_JOINED = "b_joined";
export const BROADCAST_B_SUBMITTED = "b_submitted";
export const BROADCAST_B_SIGNED = "b_signed";

/** Starea șoferului care întreabă (A sau B), de la `GET /api/party`: dosarul, semnătura și pozele lui, cu adrese temporare. */
export type PartyState = {
  role: "A" | "B";
  claimId: string;
  ref: string;
  status: string;
  /** Datele lui B au fost trimise (pentru A: mereu adevărat). */
  submitted: boolean;
  signed: boolean;
  photos: { id: string; url: string }[];
};
