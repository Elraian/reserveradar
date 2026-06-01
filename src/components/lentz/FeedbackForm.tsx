"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { submitFeedback } from "@/lib/feedback";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function FeedbackForm({
  open,
  onClose,
  tunnus,
}: {
  open: boolean;
  onClose: () => void;
  tunnus?: string | null;
}) {
  const [f, setF] = useState({
    esmased_muljed: "",
    mis_meeldis: "",
    mida_parandada: "",
    millega_taiendada: "",
    kasulikkus: 0,
    kontakt: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const TA =
    "mt-1 w-full resize-none rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-[#14130f] outline-none focus:border-[#2f5d3a] focus:ring-1 focus:ring-[#2f5d3a]/40";

  async function send() {
    setBusy(true);
    setErr(false);
    try {
      await submitFeedback({
        esmased_muljed: f.esmased_muljed || undefined,
        mis_meeldis: f.mis_meeldis || undefined,
        mida_parandada: f.mida_parandada || undefined,
        millega_taiendada: f.millega_taiendada || undefined,
        kasulikkus: f.kasulikkus || null,
        kontakt: f.kontakt || undefined,
        tunnus: tunnus ?? null,
      });
      setDone(true);
      try {
        localStorage.setItem("rr_feedback_done", "1");
      } catch {}
      setTimeout(onClose, 1400);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="lentz max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#f1f0ea] p-6 shadow-2xl"
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#14130f]">Anna tagasisidet</h2>
                <p className="text-sm text-[#14130f]/55">Aitad meil Reserve Radarit paremaks teha.</p>
              </div>
              <button onClick={onClose} className="rounded-full p-1 text-[#14130f]/50 hover:bg-black/5" aria-label="Sulge">
                <X className="h-5 w-5" />
              </button>
            </div>

            {done ? (
              <div className="py-10 text-center">
                <p className="text-2xl">🌲</p>
                <p className="mt-2 font-medium text-[#14130f]">Aitäh tagasiside eest!</p>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-[#14130f]">1. Esmased muljed</span>
                  <textarea rows={2} value={f.esmased_muljed} onChange={(e) => set("esmased_muljed", e.target.value)} className={TA} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-[#14130f]">2. Mis meeldis?</span>
                  <textarea rows={2} value={f.mis_meeldis} onChange={(e) => set("mis_meeldis", e.target.value)} className={TA} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-[#14130f]">3. Mida peaks parandama?</span>
                  <textarea rows={2} value={f.mida_parandada} onChange={(e) => set("mida_parandada", e.target.value)} className={TA} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-[#14130f]">4. Millega saaksime täiendada?</span>
                  <textarea rows={2} value={f.millega_taiendada} onChange={(e) => set("millega_taiendada", e.target.value)} className={TA} />
                </label>

                <div>
                  <span className="text-sm font-medium text-[#14130f]">5. Kui kasulik? (1–10)</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => set("kasulikkus", n)}
                        className={`h-8 w-8 rounded-lg text-sm font-medium transition ${
                          f.kasulikkus === n
                            ? "bg-[#2f5d3a] text-[#f1f0ea]"
                            : "bg-white text-[#14130f] ring-1 ring-black/10 hover:bg-black/5"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-[#14130f]">6. Kontakt (vabatahtlik)</span>
                  <input
                    value={f.kontakt}
                    onChange={(e) => set("kontakt", e.target.value)}
                    placeholder="e-post või telefon"
                    className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-[#14130f] outline-none focus:border-[#2f5d3a] focus:ring-1 focus:ring-[#2f5d3a]/40"
                  />
                </label>

                {err && <p className="text-sm text-red-600">Saatmine ebaõnnestus — proovi uuesti.</p>}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={onClose} className="px-3 py-2 text-sm text-[#14130f]/60 hover:text-[#14130f]">
                    Hiljem
                  </button>
                  <button
                    onClick={send}
                    disabled={busy}
                    className="rounded-lg bg-[#14130f] px-4 py-2 text-sm font-medium text-[#f1f0ea] transition hover:bg-[#14130f]/90 disabled:opacity-50"
                  >
                    {busy ? "Saadan…" : "Saada tagasiside"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
