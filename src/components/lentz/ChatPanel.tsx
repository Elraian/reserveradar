"use client";

import { useState } from "react";
import type { ParcelReport } from "@/lib/sampleReport";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "Kas tohin siia maja ehitada?",
  "Millal tohib metsa raiuda?",
  "Mida tähendab piiranguvöönd?",
];

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export default function ChatPanel({ report }: { report: ParcelReport }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Stream the AI explanation for this parcel from the backend /api/chat (SSE).
  // The backend resolves by katastritunnus, so every question is answered with
  // a grounded explanation of the current parcel.
  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true);

    const append = (chunk: string) =>
      setMsgs((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role === "assistant") next[next.length - 1] = { ...last, text: last.text + chunk };
        return next;
      });

    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tunnus: report.tunnus }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const json = line.replace(/^data:\s?/, "").trim();
          if (!json) continue;
          try {
            const evt = JSON.parse(json);
            if (evt.type === "text") append(evt.content);
            else if (evt.type === "error") append(`\n⚠️ ${evt.message}`);
          } catch {
            /* ignore partial frames */
          }
        }
      }
    } catch {
      append("\n⚠️ Vestlus ei õnnestunud — kontrolli, et taustasüsteem töötab.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-20 flex flex-col items-end">
      {open && (
        <div className="rr-fade-up pointer-events-auto mb-3 flex h-[28rem] w-[22rem] flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-black/10">
          <div className="flex items-center justify-between bg-[#14130f] px-4 py-3 text-[#f1f0ea]">
            <span className="font-semibold">Küsi Reserve Radarilt</span>
            <button onClick={() => setOpen(false)} className="text-[#f1f0ea]/70 hover:text-[#f1f0ea]">✕</button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-[#14130f]/50">
                  Küsi selle kinnistu kohta. Näiteks:
                </p>
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="block w-full bg-black/5 px-3 py-2 text-left text-sm text-[#14130f]/80 ring-1 ring-black/10 hover:bg-black/10"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-[#14130f] text-[#f1f0ea]"
                    : "bg-black/5 text-[#14130f]/80 ring-1 ring-black/10"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-black/10 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Kirjuta küsimus…"
              className="w-full bg-black/5 px-3 py-2 text-sm text-[#14130f] placeholder:text-[#14130f]/40 outline-none ring-1 ring-black/10 focus:ring-[#14130f]/40"
            />
            <button className="bg-[#14130f] px-3 py-2 text-sm text-[#f1f0ea] hover:bg-[#14130f]/85">
              →
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex items-center gap-2 bg-[#14130f] px-5 py-3 font-medium text-[#f1f0ea] shadow-lg ring-1 ring-black/10 transition hover:bg-[#14130f]/85"
      >
        Küsi lisaks
      </button>
    </div>
  );
}
