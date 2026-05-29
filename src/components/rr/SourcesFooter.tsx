"use client";

import { ExternalLink } from "lucide-react";
import type { ParcelResult } from "@/lib/types";

// Data provenance — the differentiator made explicit. Links to the canonical
// sources the answer was built from (kataster, EELIS via the official kitsendused
// app, and the exact Riigi Teataja akt the §-citations point at).
export function SourcesFooter({ parcel }: { parcel: ParcelResult }) {
  const aktId = parcel.eeskiriAkt;
  const links: { label: string; href: string }[] = [
    {
      label: "Maa-amet kataster",
      href: `https://xgis.maaamet.ee/ky/${parcel.tunnus}`,
    },
    {
      label: "Kitsendused (EELIS)",
      href: `https://kitsendused.kataster.ee/public?code=${parcel.tunnus}`,
    },
  ];
  if (aktId) {
    links.push({
      label: `Riigi Teataja §-d (akt ${aktId})`,
      href: `https://www.riigiteataja.ee/akt/${aktId}`,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rr-eyebrow">Allikad</div>
      <div className="flex flex-col gap-1">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-forest"
          >
            <span className="truncate">{l.label}</span>
            <ExternalLink className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
          </a>
        ))}
      </div>
    </div>
  );
}
