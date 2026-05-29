"use client";

import { useEffect, useState } from "react";
import { TreePine, Plus, MapPin, Moon, Sun, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { RecentLookup } from "@/lib/useRadar";
import { cn } from "@/lib/utils";

const THEME_KEY = "reserveradar.theme";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark") setTheme("dark");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return { theme, setTheme };
}

export function Sidebar({
  recents,
  activeTunnus,
  onNew,
  onOpen,
  open,
  onToggle,
}: {
  recents: RecentLookup[];
  activeTunnus: string | null;
  onNew: () => void;
  onOpen: (tunnus: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const { theme, setTheme } = useTheme();

  // Collapsed: a thin rail with logo + reopen + new-search affordances.
  if (!open) {
    return (
      <aside className="hidden w-12 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3 md:flex">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <TreePine className="size-4" />
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Ava külgriba"
          className="mt-3 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
        <button
          type="button"
          onClick={onNew}
          aria-label="Uus otsing"
          className="mt-1 grid size-8 place-items-center rounded-lg text-forest transition-colors hover:bg-surface-2"
        >
          <Plus className="size-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      {/* Brand */}
      <div className="flex h-13 items-center gap-2.5 px-4">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <TreePine className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-none">
          <span className="text-[14px] font-semibold tracking-tight text-foreground">
            Reserve Radar
          </span>
          <span className="rr-mono mt-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            katastri kitsendused
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Peida külgriba"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <div className="rr-tick-row" />

      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl border border-input bg-card px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-forest/40 hover:bg-surface-2"
        >
          <Plus className="size-4 text-forest" />
          Uus otsing
        </button>
      </div>

      {/* Recents */}
      <div className="min-h-0 flex-1 overflow-y-auto rr-scroll px-3">
        {recents.length > 0 && (
          <>
            <div className="rr-eyebrow mb-2 px-1">Viimased</div>
            <div className="flex flex-col gap-0.5">
              {recents.map((r) => {
                const active = r.tunnus === activeTunnus;
                return (
                  <button
                    key={r.tunnus}
                    type="button"
                    onClick={() => onOpen(r.tunnus)}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-surface-2",
                    )}
                  >
                    <MapPin
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        active ? "text-forest" : "text-muted-foreground",
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="rr-mono truncate text-[12px] tracking-wide text-foreground">
                        {r.tunnus}
                      </span>
                      {r.address && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {r.address}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer — theme toggle + disclaimer. */}
      <div className="border-t border-border p-3">
        <div className="mb-2.5 inline-flex rounded-lg border border-input bg-card p-0.5">
          <button
            type="button"
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
            aria-label="Hele teema"
            className={cn(
              "grid size-7 place-items-center rounded-md transition-colors",
              theme === "light" ? "bg-surface-3 text-foreground" : "text-muted-foreground",
            )}
          >
            <Sun className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
            aria-label="Tume teema"
            className={cn(
              "grid size-7 place-items-center rounded-md transition-colors",
              theme === "dark" ? "bg-surface-3 text-foreground" : "text-muted-foreground",
            )}
          >
            <Moon className="size-3.5" />
          </button>
        </div>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Avaandmed: Maa-amet, EELIS, Riigi Teataja. Info on suunav, mitte
          ametlik otsus.
        </p>
      </div>
    </aside>
  );
}
