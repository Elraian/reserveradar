"use client";

import { useState } from "react";
import type {
  ParcelReport,
  Restriction,
  Severity,
} from "@/lib/sampleReport";
import type { TopicKey } from "@/components/lentz/TopicFilter";

const SEV: Record<Severity, { dot: string; ring: string; text: string; label: string }> = {
  red: { dot: "bg-[#14130f]", ring: "ring-black/20 bg-black/5", text: "text-[#14130f]", label: "Olulised piirangud" },
  amber: { dot: "bg-[#14130f]/55", ring: "ring-black/15 bg-black/[0.03]", text: "text-[#14130f]/70", label: "Mõned piirangud" },
  green: { dot: "bg-[#14130f]/30", ring: "ring-black/10 bg-black/[0.03]", text: "text-[#14130f]/55", label: "Piiranguteta" },
};

const ha = (m2: number) => (m2 / 10000).toLocaleString("et-EE", { maximumFractionDigits: 2 });

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-black/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-black/[0.03]"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[#14130f]/60">
          {title}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-[#14130f]/50 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="square" strokeLinejoin="miter" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </section>
  );
}

function RestrictionRow({ r }: { r: Restriction }) {
  const s = SEV[r.severity];
  return (
    <div className={`p-3 ring-1 ${s.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 ${s.dot}`} />
            <span className="font-semibold">{r.title}</span>
          </div>
          <p className="mt-0.5 text-sm text-[#14130f]/70">{r.area}</p>
        </div>
        <span className="shrink-0 text-right text-xs text-[#14130f]/50">
          {r.coveragePct >= 1 ? `${r.coveragePct}%` : `${ha(r.areaM2)} ha`}
          {r.taxRelief ? (
            <span className="mt-1 block bg-black/10 px-1.5 py-0.5 font-medium text-[#14130f]">
              −{r.taxRelief}% maamaks
            </span>
          ) : null}
        </span>
      </div>
      {r.rule && (
        <p className="mt-2 text-xs text-[#14130f]/50">
          {r.ruleUrl ? (
            <a href={r.ruleUrl} target="_blank" rel="noreferrer" className="underline decoration-black/40 underline-offset-2 hover:text-[#14130f]">
              {r.rule}
            </a>
          ) : (
            r.rule
          )}
        </p>
      )}
      {r.cardUrl && (
        <a href={r.cardUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[#14130f]/70 underline-offset-2 hover:underline">
          Ametlik kitsenduste kaart →
        </a>
      )}
    </div>
  );
}

export default function RiskReport({
  report,
  topics,
}: {
  report: ParcelReport;
  topics?: Set<TopicKey>;
}) {
  const s = SEV[report.overall];
  const show = (k: TopicKey) => !topics || topics.size === 0 || topics.has(k);
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white text-[#14130f]">
      {/* header */}
      <div className="px-5 pt-5">
        <p className="text-xs font-medium text-[#14130f]/50">Katastritunnus {report.tunnus}</p>
        <h2 className="mt-0.5 text-xl font-bold leading-tight">{report.address}</h2>
        <p className="text-sm text-[#14130f]/50">
          {report.municipality}, {report.county}
        </p>
      </div>

      {/* severity banner */}
      <div className="px-5 pt-4">
        <div className={`flex items-center gap-3 px-4 py-3 ring-1 ${s.ring}`}>
          <span className={`flex h-9 w-9 items-center justify-center ${s.dot}`}>
            <span className="text-[#f1f0ea]">!</span>
          </span>
          <div>
            <p className={`font-semibold ${s.text}`}>{s.label}</p>
            <p className="text-xs text-[#14130f]/50">
              {report.restrictions.length} kitsendust · {report.speciesTotal} kaitsealust liiki
            </p>
          </div>
        </div>
      </div>

      {/* key facts */}
      {show("property") && (
      <Section title="Kinnistu">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Fact k="Sihtotstarve" v={report.useType} />
          <Fact k="Pindala" v={`${ha(report.areaM2)} ha`} />
          <Fact k="Mets" v={`${ha(report.forestM2)} ha`} />
          <Fact k="Rohumaa" v={`${ha(report.grassM2)} ha`} />
          <Fact k="Omandivorm" v={report.owner} />
          <Fact k="Maksustamishind" v={`${report.taxValue.toLocaleString("et-EE")} €`} />
        </dl>
      </Section>
      )}

      {/* restrictions */}
      {show("restrictions") && (
      <Section title={`Kitsendused (${report.restrictions.length})`}>
        <div className="space-y-2">
          {report.restrictions.map((r, i) => (
            <RestrictionRow key={i} r={r} />
          ))}
        </div>
      </Section>
      )}

      {/* ecological state — condensed gauge + terse good/concerning lines */}
      {show("eco") && report.eco && (
      <Section title="Ökoloogiline seisund" defaultOpen>
        <div className="mb-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-[#14130f]/50">Ökoloogiline väärtus</span>
            <span className="text-sm font-semibold">
              {report.eco.score}
              <span className="text-[#14130f]/40">/100</span>
            </span>
          </div>
          <div className="h-2 w-full bg-black/10">
            <div className="h-full bg-[#14130f]" style={{ width: `${report.eco.score}%` }} />
          </div>
        </div>
        <EcoList label="Hästi" items={report.eco.good} good />
        <EcoList label="Murettekitav" items={report.eco.concerning} />
      </Section>
      )}

      {/* species */}
      {show("species") && (
      <Section title={`Kaitsealused liigid (${report.speciesTotal})`}>
        <div className="flex flex-wrap gap-1.5">
          {report.species.map((sp, i) => (
            <span
              key={i}
              className="bg-black/5 px-2.5 py-1 text-xs text-[#14130f]/80 ring-1 ring-black/15"
              title={sp.latin}
            >
              {sp.et}
            </span>
          ))}
          {report.speciesTotal > report.species.length && (
            <span className="bg-black/10 px-2.5 py-1 text-xs font-medium text-[#14130f]">
              + veel {report.speciesTotal - report.species.length}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-[#14130f]/40">
          III kategooria kaitsealused liigid (EELIS). I–II kategooria andmed on
          piiratud juurdepääsuga.
        </p>
      </Section>
      )}

      {/* forest */}
      {show("forest") && (
      <Section title="Mets ja raie">
        <div className="grid grid-cols-2 gap-3">
          <MiniStat n={report.forestStands} label="metsaeraldist" tone="neutral" />
          <MiniStat
            n={report.fellingNotices}
            label="aktiivset raieteatist"
            tone={report.fellingNotices === 0 ? "good" : "warn"}
          />
        </div>
      </Section>
      )}

      {/* plain-language summary */}
      {show("summary") && (
      <Section title="Lihtsalt öeldes">
        <SummaryList tone="text-[#14130f]" items={report.summary.allowed} title="Mida tohid" />
        <SummaryList tone="text-[#14130f]/70" items={report.summary.forbidden} title="Mida ei tohi" />
        <SummaryList tone="text-[#14130f]/70" items={report.summary.consider} title="Mida pead arvestama" />
        <p className="mt-3 text-[11px] leading-relaxed text-[#14130f]/40">
          See on informatiivne kokkuvõte avaandmete põhjal, mitte juriidiline
          nõuanne. Täpsete tingimuste osas pöördu Keskkonnaameti poole.
        </p>
      </Section>
      )}

      {/* rule docs */}
      {show("rules") && (
      <Section title="Õigusaktid">
        {report.ruleDocs.map((d, i) => (
          <a
            key={i}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="block bg-black/5 px-3 py-2 text-sm text-[#14130f]/80 ring-1 ring-black/10 hover:bg-black/10"
          >
            {d.title}
            <span className="mt-0.5 block text-xs text-[#14130f]/50">
              {d.issuer} · {d.date}
            </span>
          </a>
        ))}
      </Section>
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-[#14130f]/40">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function MiniStat({ n, label, tone }: { n: number; label: string; tone: "good" | "warn" | "neutral" }) {
  const c =
    tone === "good" ? "text-[#14130f] bg-black/10 ring-black/20"
    : tone === "warn" ? "text-[#14130f]/80 bg-black/5 ring-black/15"
    : "text-[#14130f]/80 bg-black/5 ring-black/10";
  return (
    <div className={`px-3 py-3 text-center ring-1 ${c}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function EcoList({ label, items, good = false }: { label: string; items: string[]; good?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#14130f]/45">
        {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#14130f]/80">
            <span
              className={`mt-[6px] h-1.5 w-1.5 shrink-0 ${good ? "bg-[#14130f]" : "border border-[#14130f]"}`}
            />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryList({ tone, items, title }: { tone: string; items: string[]; title: string }) {
  return (
    <div className="mb-3">
      <p className={`mb-1 text-xs font-semibold ${tone}`}>
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-[#14130f]/80">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
