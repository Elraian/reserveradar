// GET /api/report/{tunnus} — Lennart's ParcelReport shape, from the live backend.
// CORS-open so the lentzUI app (different port/origin) can fetch it directly.
import { NextResponse } from "next/server";
import { buildReport } from "@/lib/server/report";
import { isValidTunnus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tunnus: string }> },
) {
  const { tunnus } = await params;
  if (!isValidTunnus(tunnus)) {
    return NextResponse.json({ found: false, tunnus, error: "Vigane katastritunnus" }, { status: 400, headers: CORS });
  }
  try {
    const report = await buildReport(tunnus);
    return NextResponse.json(report, { status: report.found ? 200 : 404, headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { found: false, tunnus, error: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: CORS },
    );
  }
}
