"use client";

import { useCallback, useRef, useState } from "react";
import {
  isValidTunnus,
  type ChatStreamEvent,
  type ParcelResult,
} from "@/lib/types";

export type ToolEvent = {
  id: string;
  name: string;
  detail?: string;
  status: "running" | "done" | "failed";
};

export type Turn = {
  id: string;
  tunnus: string;
  /** Visible agent activity for this turn. */
  tools: ToolEvent[];
  /** Streamed markdown answer. */
  answer: string;
  streaming: boolean;
  eeskiriAkt?: string | null;
  /** Set when the input wasn't a valid tunnus (free-text, not yet supported). */
  notice?: string;
  error?: string;
};

const newId = () => Math.random().toString(36).slice(2, 10);

export type RecentLookup = { tunnus: string; address?: string | null };

export function useRadar() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [parcel, setParcel] = useState<ParcelResult | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [recents, setRecents] = useState<RecentLookup[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setParcel(null);
    setStreaming(false);
  }, []);

  const updateTurn = useCallback(
    (id: string, mut: (t: Turn) => void) => {
      setTurns((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next: Turn = { ...t, tools: t.tools.map((c) => ({ ...c })) };
          mut(next);
          return next;
        }),
      );
    },
    [],
  );

  const send = useCallback(
    async (raw: string) => {
      const tunnus = raw.trim();
      if (streaming) return;

      const turnId = newId();

      // Free-text guard: the backend resolves by cadastral number. Keep the
      // conversation shape but be honest that prose follow-ups aren't wired yet.
      if (!isValidTunnus(tunnus)) {
        setTurns((prev) => [
          ...prev,
          {
            id: turnId,
            tunnus,
            tools: [],
            answer: "",
            streaming: false,
            notice:
              "Praegu otsin **katastritunnuse** järgi — kuju `NNNNN:NNN:NNNN`, nt `63902:001:0751`. Sisesta tunnus ja näitan, mida sellel maal tohib teha.",
          },
        ]);
        return;
      }

      setTurns((prev) => [
        ...prev,
        { id: turnId, tunnus, tools: [], answer: "", streaming: true },
      ]);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tunnus }),
          signal: ctrl.signal,
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
            let evt: ChatStreamEvent;
            try {
              evt = JSON.parse(json) as ChatStreamEvent;
            } catch {
              continue;
            }
            applyEvent(turnId, evt);
          }
        }
      } catch (err) {
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || /aborted|signal/.test(err.message ?? ""));
        updateTurn(turnId, (t) => {
          t.streaming = false;
          if (!isAbort) {
            t.error = err instanceof Error ? err.message : String(err);
          }
        });
      } finally {
        abortRef.current = null;
        updateTurn(turnId, (t) => {
          t.streaming = false;
        });
        setStreaming(false);
      }
    },
    // applyEvent defined below via closure over setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, updateTurn],
  );

  function applyEvent(turnId: string, evt: ChatStreamEvent) {
    switch (evt.type) {
      case "tool_call":
        updateTurn(turnId, (t) => {
          t.tools = [
            ...t.tools,
            { id: evt.id, name: evt.name, detail: evt.detail, status: "running" },
          ];
        });
        break;
      case "tool_result":
        updateTurn(turnId, (t) => {
          t.tools = t.tools.map((c) =>
            c.id === evt.id
              ? { ...c, status: evt.ok ? "done" : "failed", detail: evt.detail ?? c.detail }
              : c,
          );
        });
        break;
      case "parcel":
        // Merge: a later event may add geometry/fills to the same parcel.
        setParcel((prev) => {
          if (prev && prev.tunnus === evt.parcel.tunnus) {
            return { ...prev, ...evt.parcel, areas: evt.parcel.areas ?? prev.areas };
          }
          return evt.parcel;
        });
        if (evt.parcel.found) {
          setRecents((prev) => {
            const without = prev.filter((r) => r.tunnus !== evt.parcel.tunnus);
            return [
              { tunnus: evt.parcel.tunnus, address: evt.parcel.address },
              ...without,
            ].slice(0, 8);
          });
        }
        break;
      case "text":
        updateTurn(turnId, (t) => {
          t.answer += evt.content;
        });
        break;
      case "error":
        updateTurn(turnId, (t) => {
          t.error = evt.message;
        });
        break;
      case "done":
        updateTurn(turnId, (t) => {
          t.streaming = false;
          t.eeskiriAkt = evt.eeskiriAkt ?? t.eeskiriAkt;
        });
        break;
    }
  }

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { turns, parcel, streaming, recents, send, stop, reset };
}
