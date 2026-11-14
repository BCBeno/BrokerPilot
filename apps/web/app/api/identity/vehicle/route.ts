import { NextResponse } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/upload";
import { NOT_CONFIGURED, SERVER_ERROR, TOO_MANY, clientIp, fail } from "@/lib/claims/server";
import { pickPolicy, prefillDocuments, type Prefill } from "@/lib/identity/prefill";
import { accidentDay, identityContext, loadClientCar, verifiedClientId } from "@/lib/identity/server";

export const runtime = "nodejs";

const allow = createRateLimiter(20, 10 * 60_000);

const bodySchema = z.object({ token: z.string().max(200), vehicleId: z.uuid(), occurredAt: z.string().max(40).nullish() });

/** Pasul 3: clientul verificat alege mașina implicată; întoarcem talonul, polița RCA și contactul, gata completate. */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return TOO_MANY();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Cerere invalidă.", "bad_request");

  const ctx = identityContext();
  if (!ctx) return NOT_CONFIGURED();
  const clientId = await verifiedClientId(ctx, body.data.token);
  if (!clientId) return fail(401, "Verificarea a expirat. Cereți un cod nou.", "unverified");

  const car = await loadClientCar(ctx.db, clientId);
  if (!car) return SERVER_ERROR();
  const vehicle = car.vehicles.find((v) => v.id === body.data.vehicleId);
  if (!vehicle) return fail(404, "Mașina nu a fost găsită.", "not_found");

  const policy = pickPolicy(car.policies, vehicle.id, accidentDay(body.data.occurredAt));
  const documents = prefillDocuments(car.client, vehicle, policy, new Date());
  return NextResponse.json({ vehicleId: vehicle.id, plate: documents.registration.fields.plate?.value ?? vehicle.plate, documents } satisfies Prefill);
}
