"use client";

import { useEffect, useRef } from "react";
import { TreePine, ArrowRight, AlertCircle } from "lucide-react";
import type { Turn } from "@/lib/useRadar";
import { AnswerMarkdown } from "./AnswerMarkdown";
import { ToolActivity } from "./ToolActivity";
import { TunnusInput } from "./TunnusInput";

const TEST_PARCELS: { tunnus: string; note: string }[] = [
  { tunnus: "63902:001:0751", note: "Vahtrepa MKA · piiranguvöönd · Natura 2000 · 12 III-kat. liiki" },
  { tunnus: "66001:003:0760", note: "tavaline tulundusmets · raie lubatud, metsateatis" },
];

export function ChatThread({
  turns,
  streaming,
  onSend,
  onStop,
}: {
  turns: Turn[];
  streaming: boolean;
  onSend: (tunnus: string) => void;
  onStop: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const empty = turns.length === 0;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Source line — quiet provenance cue at the top of the thread. */}
      <header className="flex h-13 min-h-13 items-center gap-2.5 border-b border-border bg-surface-1 px-5">
        <span className="rr-live-dot" />
        <span className="rr-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          Maa-amet kataster · EELIS · Riigi Teataja
        </span>
      </header>
      <div className="rr-tick-row" />

      <div ref={scrollRef} className="rr-scroll min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <EmptyState onSend={onSend} streaming={streaming} onStop={onStop} />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-7 px-6 py-7">
            {turns.map((t) => (
              <TurnView key={t.id} turn={t} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom input bar — only once a conversation has started. */}
      {!empty && (
        <div className="border-t border-border bg-surface-1">
          <div className="mx-auto max-w-3xl px-6 py-3">
            <TunnusInput onSend={onSend} onStop={onStop} streaming={streaming} autoFocus />
            <p className="rr-mono mt-1.5 px-1 text-[10px] text-muted-foreground">
              Informatiivne — ei asenda Keskkonnaameti ametlikku seisukohta.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className="rr-fadein flex flex-col gap-3">
      {/* User turn — the tunnus they asked about. */}
      <div className="flex justify-end">
        <div className="rr-mono rounded-2xl rounded-br-md bg-secondary px-4 py-2 text-[14px] tracking-wide text-secondary-foreground">
          {turn.tunnus}
        </div>
      </div>

      {/* Assistant turn. */}
      <div className="flex flex-col gap-3">
        <ToolActivity tools={turn.tools} />

        {turn.notice && (
          <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
            <AnswerMarkdown>{turn.notice}</AnswerMarkdown>
          </div>
        )}

        {turn.answer && (
          <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            <AnswerMarkdown>{turn.answer}</AnswerMarkdown>
            {turn.streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-forest/70" />
            )}
          </div>
        )}

        {turn.streaming && !turn.answer && turn.tools.length === 0 && (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="rr-live-dot" /> Otsin…
          </div>
        )}

        {turn.error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>Midagi läks viltu: {turn.error}. Proovi sama tunnust uuesti.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  onSend,
  streaming,
  onStop,
}: {
  onSend: (tunnus: string) => void;
  streaming: boolean;
  onStop: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-12">
      <div className="rr-fadein">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-1 px-3 py-1">
          <TreePine className="size-3.5 text-forest" />
          <span className="rr-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Eesti maa · kitsendused selges keeles
          </span>
        </div>

        <h1 className="text-pretty text-3xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-4xl">
          Mida tohib sellel maal teha?
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
          Sisesta katastritunnus — näitan iga piirangu, mis sellele maatükile
          kehtib, ja seletan selges eesti keeles, mida tohib ja mida mitte. Iga
          väide on viidatud allikale, mitte lihtsalt loetletud.
        </p>

        <div className="mt-7">
          <TunnusInput onSend={onSend} onStop={onStop} streaming={streaming} autoFocus />
        </div>

        <div className="mt-8">
          <div className="rr-eyebrow mb-2.5">Proovi näidiskinnistut</div>
          <div className="flex flex-col gap-2">
            {TEST_PARCELS.map((p) => (
              <button
                key={p.tunnus}
                type="button"
                onClick={() => onSend(p.tunnus)}
                disabled={streaming}
                className="group flex items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-3 text-left transition-colors hover:border-forest/40 hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="rr-mono text-[13px] font-medium tracking-wide text-forest">
                  {p.tunnus}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                  {p.note}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-forest" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
