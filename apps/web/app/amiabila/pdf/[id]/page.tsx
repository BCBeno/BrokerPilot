import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentView } from "@/components/amiabila-form/document-view";
import { getServerEnv } from "@/lib/env";
import { loadClaimDocument } from "@/lib/claims/form-data";
import { verifyRenderKey } from "@/lib/claims/pdf";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Constatare amiabilă | BrokerPilot", robots: { index: false } };

/** Pagina din care serverul face PDF-ul (Chromium). Cere o cheie scurtă semnată; fără ea sau cu una expirată = 404. */
export default async function PdfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  const secret = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  const db = getAdminClient();
  if (!secret || !db || !z.uuid().safeParse(id).success || !verifyRenderKey(id, k, secret)) notFound();

  const doc = await loadClaimDocument(db, id);
  if (!doc) notFound();
  return <DocumentView form={doc.form} photos={doc.photos} backHref="/" />;
}
