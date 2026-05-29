"use client";

import dynamic from "next/dynamic";
import { Map as MapIcon, Compass, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ParcelResult } from "@/lib/types";
import { OverlayChips } from "./OverlayChips";
import { SourcesFooter } from "./SourcesFooter";
import { Skeleton } from "@/components/ui/skeleton";

// MapLibre touches `window` on import — load it client-only.
const ParcelMap = dynamic(() => import("./ParcelMap").then((m) => m.ParcelMap), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

export function ContextPanel({
  parcel,
  open,
  onToggle,
}: {
  parcel: ParcelResult | null;
  open: boolean;
  onToggle: () => void;
}) {
  // Collapsed: thin rail with a reopen button (keeps the map one click away).
  if (!open) {
    return (
      <aside className="hidden w-12 shrink-0 flex-col items-center border-l border-border bg-surface-1 py-3 lg:flex">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Ava kaardipaneel"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <PanelRightOpen className="size-4" />
        </button>
        <Compass className="mt-3 size-4 text-forest" />
      </aside>
    );
  }

  return (
    <aside className="hidden w-[400px] shrink-0 flex-col border-l border-border bg-surface-1 lg:flex xl:w-[440px]">
      <header className="flex h-13 items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Peida kaardipaneel"
            className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <PanelRightClose className="size-4" />
          </button>
          <Compass className="size-4 text-forest" />
          <span className="rr-eyebrow">Kaart &amp; kitsendused</span>
        </div>
        {parcel?.zone && parcel.found && (
          <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground">
            {parcel.zone}
          </span>
        )}
      </header>
      <div className="rr-tick-row" />

      {!parcel ? (
        <EmptyPanel />
      ) : !parcel.found ? (
        <NotFoundPanel tunnus={parcel.tunnus} />
      ) : (
        <>
          {/* Map — fixed slice at the top, the focal cartographic element. */}
          <div className="h-[42%] min-h-56 border-b border-border">
            <ParcelMap parcel={parcel} />
          </div>

          {/* Scrollable detail. */}
          <div className="rr-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-border px-4 py-3.5">
              <div className="rr-mono text-[13px] font-medium tracking-wide text-foreground">
                {parcel.tunnus}
              </div>
              {parcel.address && (
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {parcel.address}
                </div>
              )}
            </div>

            <div className="px-4 py-4">
              <div className="rr-eyebrow mb-3">Kattuvad alad</div>
              <OverlayChips areas={parcel.areas ?? []} />
            </div>

            <div className="border-t border-border px-4 py-4">
              <SourcesFooter parcel={parcel} />
            </div>
          </div>

          {/* Provenance footer — canonical/live cue. */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <span className="rr-live-dot" style={{ width: 5, height: 5 }} />
            <span className="rr-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Live · gsavalik.envir.ee WFS
            </span>
          </div>
        </>
      )}
    </aside>
  );
}

function EmptyPanel() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl border border-hairline bg-card">
        <MapIcon className="size-5 text-muted-foreground" />
      </span>
      <p className="max-w-56 text-[12.5px] leading-relaxed text-muted-foreground">
        Sisesta katastritunnus — siia tekib kinnistu kaart, kattuvad kaitsealad
        ja allikate viited.
      </p>
    </div>
  );
}

function NotFoundPanel({ tunnus }: { tunnus: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <p className="rr-mono mb-1 text-[13px] tracking-wide text-foreground">{tunnus}</p>
      <p className="max-w-60 text-[12.5px] leading-relaxed text-muted-foreground">
        See katastritunnus pole kehtivas katastris. Kontrolli numbrit — võib olla
        aegunud, jagatud või ühendatud üksus.
      </p>
    </div>
  );
}
