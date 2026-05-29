"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import SearchBar from "@/components/SearchBar";
import RuixenQueryBox from "@/components/ui/ruixen-query-box";
import PainterlyCanopy from "@/components/ui/painterly-canopy";
import TopicFilter, { TOPICS, type TopicKey } from "@/components/TopicFilter";
import RiskReport from "@/components/RiskReport";
import ChatPanel from "@/components/ChatPanel";
import GlobeLoader from "@/components/GlobeLoader";
import { sampleReport } from "@/app/_data/sampleReport";

const ParcelMap = dynamic(() => import("@/components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#e2ded0]" />,
});

type View = "idle" | "loading" | "report";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Home() {
  const [view, setView] = useState<View>("idle");
  const [query, setQuery] = useState("");
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

  function handleSearch(q: string) {
    setQuery(q);
    setView("loading");
    // demo: hardcoded data — give the globe loader a moment to show
    setTimeout(() => setView("report"), 2200);
  }

  return (
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

      {view === "report" && (
        <motion.main
          key="report"
          className="flex h-screen flex-col bg-[#f1f0ea]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          {/* top search bar */}
          <motion.header
            className="z-10 flex items-center gap-3 border-b border-black/10 bg-[#f1f0ea]/90 px-4 py-2.5 backdrop-blur"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <button
              onClick={() => setView("idle")}
              className="text-lg font-bold tracking-tight text-[#14130f]"
            >
              ◎ Reserve Radar
            </button>
            <div className="mx-auto w-full max-w-xl">
              <SearchBar variant="bar" initialValue={query} onSearch={handleSearch} />
            </div>
          </motion.header>

          {/* split: map + report */}
          <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1.4fr_minmax(360px,460px)]">
            <motion.div
              className="relative hidden md:block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <ParcelMap report={sampleReport} />
            </motion.div>
            <motion.div
              className="overflow-hidden border-l border-black/10"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
            >
              <RiskReport report={sampleReport} topics={topics} />
            </motion.div>
          </div>

          <ChatPanel report={sampleReport} />
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
            className="w-full max-w-2xl text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <h1 className="text-balance font-serif text-4xl font-normal tracking-tight text-[#15140f] sm:text-5xl">
              Mida tohib sellel maal teha?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-lg text-[#14130f]/60">
              Sisesta katastritunnus või aadress ja näe koheselt, millised
              looduskaitselised piirangud kinnistule kehtivad — ilma õigus- või
              metsandusteadmiseta.
            </p>

            <div className="mx-auto mt-8 max-w-xl">
              <RuixenQueryBox
                onSubmit={handleSearch}
                placeholder="Sisesta katastritunnus või aadress…"
              />
              <TopicFilter selected={topics} onToggle={toggleTopic} />
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-[#14130f]/50">
                Proovi:
                <button
                  onClick={() => handleSearch("63902:001:0751")}
                  className="rounded-full bg-white px-3 py-1 text-[#14130f] ring-1 ring-black/10 hover:bg-black/5"
                >
                  63902:001:0751 (Hiiumaa)
                </button>
              </div>
            </div>
          </motion.div>

          <footer className="absolute bottom-5 text-xs text-[#14130f]/40">
            Andmed: EELIS · Maa-amet · Riigi Teataja — „Metsikult andmetes 2026“
          </footer>
        </motion.main>
      )}
    </AnimatePresence>
  );
}
