// Client-side interaction tracking → POST /api/track (which adds the IP and
// writes to Supabase rr_events). Fire-and-forget; never throws.
function visitorId(): string {
  try {
    let id = localStorage.getItem("rr_vid");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
      localStorage.setItem("rr_vid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function track(
  event: string,
  opts: { tunnus?: string | null; props?: Record<string, unknown> } = {},
): void {
  try {
    const body = JSON.stringify({
      event,
      tunnus: opts.tunnus ?? null,
      visitor_id: visitorId(),
      props: opts.props,
    });
    // keepalive so the event still sends if the page is navigating/closing.
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
