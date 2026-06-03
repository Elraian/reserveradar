// POST /api/track — custom interaction analytics. The client sends an event +
// visitor_id; the server adds the real IP (so we can separate experiences per
// IP, not just per browser) and writes to Supabase rr_events. Fire-and-forget.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jytpiyyzvlhovzltboxb.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_mA4j5u3GArX1pC40Ot11Xw_uR5jz_Mn";

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim(); // first hop = the client (Vercel)
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      event?: string;
      tunnus?: string | null;
      visitor_id?: string;
      props?: Record<string, unknown>;
    };
    if (!body.event) return new Response(null, { status: 204 });

    const row = {
      event: String(body.event).slice(0, 64),
      tunnus: body.tunnus ?? null,
      visitor_id: body.visitor_id ?? null,
      props: body.props ?? null,
      ip: clientIp(req),
      user_agent: req.headers.get("user-agent"),
      referer: req.headers.get("referer"),
    };

    await fetch(`${SUPABASE_URL}/rest/v1/rr_events`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
  return new Response(null, { status: 204 });
}
