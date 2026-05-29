// POST /api/chat — SSE stream for a single tunnus lookup.
// Emits tool_call/tool_result (visible agent activity), a `parcel` event that
// feeds the right panel, streamed answer text, and a final `done`.
// Body: { tunnus: string }.
import { streamAnswer } from "@/lib/server/answer-stream";
import { isValidTunnus, type ChatStreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// SSE stream stays open through the kitsendused + RT + Gemini steps; streaming
// does NOT bypass the function timeout, so lift it off the ~10s default.
export const maxDuration = 60;

function frame(evt: ChatStreamEvent): string {
  return `data: ${JSON.stringify(evt)}\n\n`;
}

export async function POST(req: Request) {
  let tunnus = "";
  try {
    const body = (await req.json()) as { tunnus?: string };
    tunnus = (body.tunnus ?? "").trim();
  } catch {
    /* fallthrough to validation */
  }

  const encoder = new TextEncoder();

  if (!isValidTunnus(tunnus)) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            frame({
              type: "error",
              message: "Vigane katastritunnus. Kuju peab olema NNNNN:NNN:NNNN, nt 63902:001:0751.",
            }),
          ),
        );
        controller.enqueue(encoder.encode(frame({ type: "done" })));
        controller.close();
      },
    });
    return sseResponse(stream);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of streamAnswer(tunnus)) {
          controller.enqueue(encoder.encode(frame(evt)));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            frame({ type: "error", message: e instanceof Error ? e.message : String(e) }),
          ),
        );
        controller.enqueue(encoder.encode(frame({ type: "done" })));
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
