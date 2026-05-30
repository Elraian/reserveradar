"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import ParcelSearch from "@/components/lentz/ParcelSearch";
import PainterlyCanopy from "@/components/lentz/ui/painterly-canopy";
import TopicFilter, { TOPICS, type TopicKey } from "@/components/lentz/TopicFilter";
import RiskReport from "@/components/lentz/RiskReport";
import ChatWidget from "@/components/lentz/ChatWidget";
import GlobeLoader from "@/components/lentz/GlobeLoader";
import { type ParcelReport } from "@/lib/sampleReport";

const ParcelMap = dynamic(() => import("@/components/lentz/ParcelMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
});

type View = "idle" | "loading" | "report";

const EASE = [0.22, 1, 0.36, 1] as const;

// Live backend (the friend's system). /api/report returns Lennart's
// ParcelReport shape and is CORS-open. Override with NEXT_PUBLIC_BACKEND_URL.
const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export default function Home() {
  const [view, setView] = useState<View>("idle");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<ParcelReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Set<TopicKey>>(
    () => new Set(TOPICS.map((t) => t.key))
  );

  function toggleTopic(key: TopicKey) {
    setTopics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Restore the searched parcel from the URL (?k=tunnus) on load, so a refresh
  // or shared link doesn't drop you back to the empty search.
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("k");
    if (k) handleSearch(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back to the landing hero — clear the parcel AND the ?k= URL so a refresh
  // here shows the landing, not the last parcel.
  function goHome() {
    setView("idle");
    setReport(null);
    setError(null);
    setQuery("");
    if (typeof window !== "undefined")
      window.history.replaceState(null, "", window.location.pathname);
  }

  async function handleSearch(q: string) {
    const tunnus = q.trim();
    setQuery(tunnus);
    setError(null);
    setView("loading");
    // Keep the URL in sync so refresh/share restores this parcel.
    if (typeof window !== "undefined")
      window.history.replaceState(null, "", `?k=${encodeURIComponent(tunnus)}`);
    try {
      const res = await fetch(
        `${BACKEND}/api/report/${encodeURIComponent(tunnus)}`
      );
      if (res.status === 404) {
        setReport(null);
        setError(`Katastritunnust ${tunnus} ei leitud kehtivas katastris.`);
        setView("idle");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ParcelReport = await res.json();
      setReport(data);
      setView("report");
    } catch {
      setError(
        "Süsteem ei vastanud. Kontrolli, et taustasüsteem töötab (port 3005)."
      );
      setView("idle");
    }
  }

  return (
    <div className="lentz min-h-dvh bg-[#f1f0ea]">
    <AnimatePresence mode="wait">
      {view === "loading" && (
        <motion.main
          key="loading"
          className="relative flex min-h-screen flex-col items-center justify-center bg-[#f1f0ea] px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.12, filter: "blur(2px)" }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <GlobeLoader size={200} />
          </motion.div>
          <motion.p
            className="mt-6 animate-pulse text-sm text-[#14130f]/60"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            Otsin andmeid EELIS-est, Maa-ametist ja Riigi Teatajast…
          </motion.p>
          {query && (
            <p className="mt-1 text-xs text-[#14130f]/40">{query}</p>
          )}
        </motion.main>
      )}

      {view === "report" && report && (
        <motion.main
          key="report"
          className="flex h-screen flex-col bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          {/* top bar: logo (back to landing) on the left, search centered */}
          <motion.header
            className="relative z-10 flex items-center border-b border-black/10 bg-white/90 px-4 py-2.5 backdrop-blur"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <button
              onClick={goHome}
              className="relative z-10 shrink-0 text-lg font-bold tracking-tight text-[#14130f] transition hover:opacity-70"
              title="Tagasi avalehele"
            >
              ◎ Reserve Radar
            </button>
            {/* dead-centered in the full header width, independent of the logo */}
            <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-xl">
                <ParcelSearch variant="bar" initialValue={query} onSearch={handleSearch} />
              </div>
            </div>
          </motion.header>

          {/* split: map + report */}
          <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1.4fr_minmax(360px,460px)]">
            <motion.div
              className="relative hidden bg-white md:block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <ParcelMap report={report} />
            </motion.div>
            <motion.div
              className="overflow-hidden border-l border-black/10"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
            >
              <RiskReport report={report} topics={topics} />
            </motion.div>
          </div>

          <ChatWidget report={report} />
        </motion.main>
      )}

      {view === "idle" && (
        <motion.main
          key="idle"
          className="relative flex min-h-screen flex-col items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          <PainterlyCanopy />
          <motion.div
            className="relative z-10 w-full max-w-2xl text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <h1 className="text-balance text-4xl font-bold tracking-tight text-[#14130f] sm:text-5xl">
              Mida tohib sellel maal teha?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-lg text-[#14130f]/60">
              Sisesta katastritunnus või aadress ja näe koheselt, millised
              piirangud kinnistule kehtivad.
            </p>

            <div className="mx-auto mt-8 max-w-xl">
              <ParcelSearch variant="hero" onSearch={handleSearch} />
              <TopicFilter selected={topics} onToggle={toggleTopic} />
              {error && (
                <p className="mt-4 text-sm text-red-600">{error}</p>
              )}
            </div>
          </motion.div>

          <footer className="absolute bottom-5 z-10 text-xs text-[#14130f]/40">
            Andmed: EELIS · Maa-amet · Riigi Teataja — „Metsikult andmetes 2026“
          </footer>
        </motion.main>
      )}
    </AnimatePresence>
    </div>
  );
}
