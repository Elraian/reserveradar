"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import type { ParcelReport } from "@/lib/sampleReport";

interface Step {
  id: string;
  name: string;
  detail: string;
  done: boolean;
  ok: boolean;
}

interface Msg {
  role: "user" | "assistant";
  text: string;
  steps?: Step[];
}

// Suggestion chips, tailored to the parcel the user just searched. Built from
// the live report so they reference the real property (address + restrictions).
function buildSuggestions(report: ParcelReport): string[] {
  const place = report.address || `kinnistu ${report.tunnus}`;
  const out: string[] = [`Kas tohin ${place} kinnistule maja ehitada?`];

  if (report.forestM2 > 0 || report.forestStands > 0)
    out.push(`Millal ja millist raiet tohin ${place} metsas teha?`);

  const top = report.restrictions?.[0];
  if (top?.area) out.push(`Mida tähendab "${top.area}" minu jaoks?`);

  out.push("Mida ma sellel kinnistul kindlasti teha EI tohi?");
  return out.slice(0, 4);
}

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
  exit: {
    opacity: 0,
    y: 24,
    scale: 0.96,
    transition: { duration: 0.18, ease: EASE },
  },
};

const messageVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 320, damping: 26 },
  },
};

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#2f5d3a]/60"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export default function ChatWidget({ report }: { report: ParcelReport }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestions = buildSuggestions(report);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, open, busy]);

  // Stream the AI explanation for this parcel from the backend /api/chat (SSE).
  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true);

    const append = (chunk: string) =>
      setMsgs((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role === "assistant")
          next[next.length - 1] = { ...last, text: last.text + chunk };
        return next;
      });

    // Update the live assistant message's visible tool-call list.
    const upsertStep = (s: Partial<Step> & { id: string }) =>
      setMsgs((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return next;
        const steps = [...(last.steps ?? [])];
        const i = steps.findIndex((x) => x.id === s.id);
        if (i === -1)
          steps.push({ id: s.id, name: s.name ?? "", detail: s.detail ?? "", done: false, ok: true });
        else steps[i] = { ...steps[i], ...s };
        next[next.length - 1] = { ...last, steps };
        return next;
      });

    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tunnus: report.tunnus, question: text }),
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
            else if (evt.type === "tool_call")
              upsertStep({ id: evt.id, name: evt.name, detail: evt.detail });
            else if (evt.type === "tool_result")
              upsertStep({ id: evt.id, done: true, ok: evt.ok, detail: evt.detail });
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

  const lastIsEmptyAssistant =
    busy &&
    msgs.length > 0 &&
    msgs[msgs.length - 1].role === "assistant" &&
    msgs[msgs.length - 1].text === "" &&
    !msgs[msgs.length - 1].steps?.length;

  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-30 flex flex-col items-start">
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-auto mb-3 flex h-[30rem] w-[23rem] flex-col overflow-hidden rounded-2xl bg-[#f1f0ea] shadow-2xl ring-1 ring-[#2f5d3a]/15"
          >
            {/* header */}
            <div className="flex items-center justify-between bg-[#14130f] px-4 py-3 text-[#f1f0ea]">
              <div className="flex items-center gap-2.5">
                <div className="relative grid h-8 w-8 place-items-center rounded-full bg-[#2f5d3a]">
                  <Sparkles className="h-4 w-4 text-[#f1f0ea]" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#5fb877] ring-2 ring-[#14130f]" />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">Reserve Radar</p>
                  <p className="text-[11px] text-[#f1f0ea]/55">
                    Küsi selle kinnistu kohta
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-[#f1f0ea]/60 transition hover:bg-white/10 hover:text-[#f1f0ea]"
                aria-label="Sulge"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* messages */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto p-4"
            >
              {msgs.length === 0 && (
                <motion.div
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-2"
                >
                  <p className="text-sm text-[#14130f]/50">
                    Küsi selle kinnistu kohta. Näiteks:
                  </p>
                  {suggestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="block w-full rounded-xl bg-white px-3 py-2 text-left text-sm text-[#14130f]/80 ring-1 ring-[#2f5d3a]/12 transition hover:bg-[#2f5d3a]/8 hover:ring-[#2f5d3a]/25"
                    >
                      {q}
                    </button>
                  ))}
                </motion.div>
              )}

              <AnimatePresence initial={false}>
                {msgs.map((m, i) => {
                  // Hide an assistant message only when it has neither text nor
                  // any tool steps yet (the typing-dots bubble covers that gap).
                  if (m.role === "assistant" && m.text === "" && !m.steps?.length)
                    return null;
                  return (
                    <motion.div
                      key={i}
                      variants={messageVariants}
                      initial="hidden"
                      animate="visible"
                      className={`max-w-[85%] overflow-hidden break-words [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "ml-auto rounded-br-sm bg-[#14130f] text-[#f1f0ea]"
                          : "rounded-bl-sm bg-white text-[#14130f]/85 ring-1 ring-[#2f5d3a]/12"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <>
                          {m.steps?.length ? <StepList steps={m.steps} /> : null}
                          <MessageBody text={m.text} />
                        </>
                      ) : (
                        m.text
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {lastIsEmptyAssistant && (
                <motion.div
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-2 py-1.5 ring-1 ring-[#2f5d3a]/12"
                >
                  <TypingDots />
                </motion.div>
              )}
            </div>

            {/* input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-[#2f5d3a]/12 bg-[#f1f0ea] p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Kirjuta küsimus…"
                className="w-full rounded-full bg-white px-4 py-2 text-sm text-[#14130f] placeholder:text-[#14130f]/40 outline-none ring-1 ring-[#2f5d3a]/12 transition focus:ring-2 focus:ring-[#2f5d3a]/40"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2f5d3a] text-[#f1f0ea] transition hover:bg-[#284f32] disabled:opacity-40"
                aria-label="Saada"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* toggle button */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#14130f] px-5 py-3 font-medium text-[#f1f0ea] shadow-lg ring-1 ring-[#2f5d3a]/20 transition hover:bg-[#14130f]/90"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X className="h-5 w-5" />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              className="flex items-center gap-2"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <MessageCircle className="h-5 w-5" />
              Küsi lisaks
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

// Minimal markdown for the assistant bubble: [link](url), **bold**, _italic_,
// and bullet lines (- / *). Keeps the streamed answer readable without a
// markdown dep — links open the law/eeskiri source in a new tab.
function inline(text: string) {
  const parts = text
    .split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|_[^_]+_)/g)
    .filter(Boolean);
  return parts.map((p, i) => {
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link)
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[#2f5d3a] underline decoration-[#2f5d3a]/40 underline-offset-2 hover:decoration-[#2f5d3a]"
        >
          {link[1]}
        </a>
      );
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_"))
      return (
        <em key={i} className="text-[#14130f]/55">
          {p.slice(1, -1)}
        </em>
      );
    return <span key={i}>{p}</span>;
  });
}

// Compact agent activity: each backend step (Kataster+EELIS, Riigi Teataja,
// AI süntees) with a spinner while running and a ✓/· when done. Lets the user
// see the tool calls behind the answer instead of a silent wait.
function StepList({ steps }: { steps: Step[] }) {
  return (
    <div className="mb-2 space-y-1 border-b border-[#2f5d3a]/10 pb-2">
      {steps.map((s) => (
        <div key={s.id} className="flex items-start gap-2 text-[11px] leading-tight">
          <span className="mt-[2px] shrink-0">
            {!s.done ? (
              <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-[#2f5d3a]/30 border-t-[#2f5d3a]" />
            ) : s.ok ? (
              <span className="text-[#2f5d3a]">✓</span>
            ) : (
              <span className="text-[#14130f]/40">·</span>
            )}
          </span>
          <span className="text-[#14130f]/55">
            <span className="font-medium text-[#14130f]/75">{s.name}</span>
            {s.detail ? <span> — {s.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function MessageBody({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className="my-1 space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#2f5d3a]" />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^[-*]\s+(.*)$/);
    if (m) {
      bullets.push(m[1]);
    } else {
      flush();
      if (line)
        out.push(
          <p key={`p-${out.length}`} className="my-0.5">
            {inline(line)}
          </p>,
        );
    }
  }
  flush();
  return <div>{out}</div>;
}
