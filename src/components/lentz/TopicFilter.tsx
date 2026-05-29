"use client";

export type TopicKey =
  | "property"
  | "restrictions"
  | "eco"
  | "species"
  | "forest"
  | "summary"
  | "rules";

export const TOPICS: { key: TopicKey; label: string }[] = [
  { key: "property", label: "Kinnistu andmed" },
  { key: "restrictions", label: "Piirangud" },
  { key: "eco", label: "Ökoloogiline seisund" },
  { key: "species", label: "Kaitsealused liigid" },
  { key: "forest", label: "Mets ja raie" },
  { key: "summary", label: "Kokkuvõte" },
  { key: "rules", label: "Õigusaktid" },
];

export default function TopicFilter({
  selected,
  onToggle,
}: {
  selected: Set<TopicKey>;
  onToggle: (key: TopicKey) => void;
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-[#14130f]/40">
        Vali, mida raportis näidata
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {TOPICS.map((t) => {
          const on = selected.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(t.key)}
              className={`cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium shadow-sm ring-1 transition-all active:scale-[0.97] ${
                on
                  ? "bg-[#14130f] text-[#f1f0ea] ring-[#14130f] hover:bg-[#14130f]/90"
                  : "bg-white text-[#14130f]/60 ring-black/15 hover:-translate-y-0.5 hover:text-[#14130f] hover:shadow-md hover:ring-[#14130f]/40"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
