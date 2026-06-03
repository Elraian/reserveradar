// Reserve Radar — feedback submission. Inserts straight into Supabase
// (rr_feedback, ReserveRadar project) with the PUBLIC publishable key. The table
// has RLS allowing anonymous INSERT only (write-only), so the key is safe to ship.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jytpiyyzvlhovzltboxb.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_mA4j5u3GArX1pC40Ot11Xw_uR5jz_Mn";

export type Feedback = {
  esmased_muljed?: string;
  mis_meeldis?: string;
  mida_parandada?: string;
  millega_taiendada?: string;
  kasulikkus?: number | null;
  kontakt?: string;
  tunnus?: string | null;
};

export async function submitFeedback(f: Feedback): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rr_feedback`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      ...f,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }),
  });
  if (!res.ok) throw new Error(`feedback HTTP ${res.status}`);
}
