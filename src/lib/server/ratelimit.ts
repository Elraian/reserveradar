// Per-IP rate limiting for the expensive endpoints (Gemini chat, reports, WFS).
// Backed by a Supabase SECURITY DEFINER function so the window is shared across
// all serverless instances. Fail-OPEN: if the check errors, allow the request
// (analytics/limits must never take the app down).
import "server-only";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jytpiyyzvlhovzltboxb.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_mA4j5u3GArX1pC40Ot11Xw_uR5jz_Mn";

export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/**
 * Returns true if the request may proceed, false if the IP is over the limit.
 * Default: 40 requests per rolling 60s per IP.
 */
export async function allowRequest(req: Request, limit = 40, windowSec = 60): Promise<boolean> {
  const ip = clientIp(req);
  if (!ip) return true;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rr_rate_check`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_ip: ip, p_limit: limit, p_window: windowSec }),
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return true; // fail open
    return (await r.json()) !== false;
  } catch {
    return true; // fail open
  }
}

const TOO_MANY =
  "Liiga palju päringuid lühikese aja jooksul. Palun oota hetk ja proovi uuesti.";

/** Standard 429 response (with CORS-open headers, matching the API). */
export function rateLimited(): Response {
  return new Response(JSON.stringify({ error: TOO_MANY }), {
    status: 429,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": "30",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
