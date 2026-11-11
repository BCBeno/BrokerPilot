import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const nominatimSchema = z.object({
  address: z
    .object({
      road: z.string().optional(),
      house_number: z.string().optional(),
      suburb: z.string().optional(),
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
    })
    .partial(),
});

/**
 * Reverse geocoding prin OSM Nominatim. Trece prin server ca să trimitem un User-Agent propriu (cerut de politica Nominatim)
 * și ca să nu expunem terțului altceva decât coordonatele. Nu logăm coordonatele.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Coordonate invalide." }, { status: 400 });
  }

  const target = new URL("https://nominatim.openstreetmap.org/reverse");
  target.searchParams.set("format", "jsonv2");
  target.searchParams.set("zoom", "18");
  target.searchParams.set("accept-language", "ro");
  target.searchParams.set("lat", String(parsed.data.lat));
  target.searchParams.set("lon", String(parsed.data.lng));

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "BrokerPilot/0.1 (prototip academic)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const { address } = nominatimSchema.parse(await res.json());
    const street = [address.road, address.house_number].filter(Boolean).join(" ");
    const place = address.city ?? address.town ?? address.village ?? address.suburb;
    const text = [street, place].filter(Boolean).join(", ");
    return NextResponse.json({ address: text });
  } catch {
    return NextResponse.json({ error: "Adresa nu a putut fi găsită." }, { status: 502 });
  }
}
