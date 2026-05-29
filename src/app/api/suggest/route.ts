// GET /api/suggest?q=<text> — autocomplete for the search box.
// Proxies Maa-amet In-ADS gazetteer (server-side, so the browser avoids CORS)
// and returns cadastral-unit suggestions: a readable label + the katastritunnus
// the report endpoint expects. Typing a place/forest/village name (e.g.
// "Vahtrepa") returns the parcels whose address matches.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const INADS =
  "https://inaadress.maaamet.ee/inaadress/gazetteer";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type InAdsItem = {
  tunnus?: string;
  aadresstekst?: string;
  ipikkaadress?: string;
  pikkaadress?: string;
  maakond?: string;
  omavalitsus?: string;
  asustusyksus?: string;
  viitepunkt_b?: string; // lat
  viitepunkt_l?: string; // lon
};

export type Suggestion = {
  tunnus: string;
  label: string; // primary line (parcel name / address)
  sub: string; // secondary line (settlement, municipality, county)
  lat: number | null;
  lon: number | null;
};

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  // In-ADS needs a couple of characters to return anything useful.
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] }, { headers: CORS });
  }

  const url =
    `${INADS}?address=${encodeURIComponent(q)}` +
    `&results=8&features=KATASTRIYKSUS&appartment=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ReserveRadar/1.0", Accept: "application/json" },
      // gazetteer is fast; keep the box responsive.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`In-ADS HTTP ${res.status}`);
    const data = (await res.json()) as { addresses?: InAdsItem[] };

    const seen = new Set<string>();
    const suggestions: Suggestion[] = [];
    for (const a of data.addresses ?? []) {
      const tunnus = (a.tunnus ?? "").trim();
      if (!tunnus || seen.has(tunnus)) continue;
      seen.add(tunnus);
      const label = (a.aadresstekst || a.asustusyksus || tunnus).trim();
      const sub = [a.asustusyksus, a.omavalitsus, a.maakond]
        .filter(Boolean)
        .join(", ");
      suggestions.push({
        tunnus,
        label,
        sub,
        lat: a.viitepunkt_b ? Number(a.viitepunkt_b) : null,
        lon: a.viitepunkt_l ? Number(a.viitepunkt_l) : null,
      });
    }
    return NextResponse.json({ suggestions }, { headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { suggestions: [], error: e instanceof Error ? e.message : String(e) },
      { status: 200, headers: CORS },
    );
  }
}
