// Simple site-wide HTTP Basic Auth gate (temporary — "only we can access it").
// Protects pages AND /api: the frontend fetches same-origin, so the browser
// reuses the entered credentials automatically. To change/lift it, edit the
// creds below (or set BASIC_AUTH_USER / BASIC_AUTH_PASS env vars in Vercel) or
// delete this file.
import { NextResponse, type NextRequest } from "next/server";

const USER = process.env.BASIC_AUTH_USER || "reserveradar";
const PASS = process.env.BASIC_AUTH_PASS || "Futures123";

export function middleware(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    // Edge runtime provides atob.
    const [user, pass] = atob(encoded).split(":");
    if (user === USER && pass === PASS) return NextResponse.next();
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Reserve Radar", charset="UTF-8"' },
  });
}

// Gate everything except Next.js internals + favicon (so the login prompt and
// assets still load).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
