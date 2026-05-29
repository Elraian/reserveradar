"use client";

export type TopicKey =
  | "property"
  | "restrictions"
  | "species"
  | "forest"
  | "summary"
  | "rules";

export const TOPICS: { key: TopicKey; label: string }[] = [
  { key: "property", label: "Kinnistu andmed" },
  { key: "restrictions", label: "Piirangud" },
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
      <div className="flex flex-wrap justify-center gap-2">
        {TOPICS.map((t) => {
          const on = selected.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(t.key)}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                on
                  ? "bg-[#14130f] text-[#f1f0ea] ring-[#14130f]"
                  : "bg-transparent text-[#14130f]/60 ring-black/20 hover:bg-black/5"
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
