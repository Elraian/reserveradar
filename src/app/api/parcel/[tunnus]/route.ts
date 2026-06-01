// GET /api/parcel/{tunnus} — panel payload (overlays + zone + 4326 geometry).
// The documented REST contract (FRONTEND_PROMPT.md). The conversational UI
// drives off /api/chat instead, but this stays available for direct callers.
import { NextResponse } from "next/server";
import { resolveParcel } from "@/lib/server/parcel";
import { isValidTunnus } from "@/lib/types";
import { allowRequest, rateLimited } from "@/lib/server/ratelimit";

// WFS/RT/Gemini need Node APIs (fetch + @google/genai) — never Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pipeline (kitsendused API + RT eeskiri + Gemini) runs ~10-25s cold; the
// default serverless timeout (~10s) would cut it off. 60s = safe headroom
// (Hobby max; raise toward 300 on Pro if needed).
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tunnus: string }> },
) {
  if (!(await allowRequest(req))) return rateLimited();
  const { tunnus } = await params;

  if (!isValidTunnus(tunnus)) {
    return NextResponse.json(
      { tunnus, found: false, error: "Vigane katastritunnus (kuju NNNNN:NNN:NNNN)" },
      { status: 400 },
    );
  }

  try {
    const result = await resolveParcel(tunnus);
    return NextResponse.json(result, { status: result.found ? 200 : 404 });
  } catch (e) {
    return NextResponse.json(
      { tunnus, found: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
