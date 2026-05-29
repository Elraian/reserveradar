// POST /api/ask — conversational answer via the Gemini tool-calling agent.
// Same backend quality as the main chat: the model calls get_kitsendused /
// get_eeskiri on demand and answers cited, multi-turn. CORS-open so the
// lentzUI app (different origin) can use the same brain.
// Body: { tunnus?: string, messages: { role: "user"|"assistant"|"model", text: string }[] }
import { NextResponse } from "next/server";
import { ask } from "@scripts/agent.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type InMsg = { role: string; text: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { tunnus?: string; messages?: InMsg[] };
  const tunnus = (body.tunnus ?? "").trim();
  const raw = Array.isArray(body.messages) ? body.messages : [];
  if (!raw.length) return NextResponse.json({ error: "no messages" }, { status: 400, headers: CORS });

  // ChatPanel uses user/assistant; the agent expects user/model.
  const messages = raw.map(
    (m): { role: "user" | "model"; text: string } => ({
      role: m.role === "assistant" ? "model" : "user",
      text: m.text,
    }),
  );
  // Seed the parcel context into the first user turn so the agent knows which unit.
  const first = messages.find((m) => m.role === "user");
  if (tunnus && first && !first.text.includes(tunnus)) {
    first.text = `(Katastriüksus ${tunnus}) ${first.text}`;
  }

  try {
    const r = (await ask(messages)) as { text: string; reasoning?: string; toolCalls?: unknown[] };
    return NextResponse.json(
      { text: r.text, reasoning: r.reasoning ?? null, toolCalls: r.toolCalls ?? [] },
      { headers: CORS },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: CORS },
    );
  }
}
