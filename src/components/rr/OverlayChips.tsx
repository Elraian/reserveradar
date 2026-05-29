"use client";

import { CATEGORY_VARS, type AreaOverlay, type Category } from "@/lib/types";

// Order categories so the most consequential (protection / zone) read first.
const CATEGORY_ORDER: Category[] = [
  "protection",
  "zone",
  "natura",
  "water",
  "hazard",
  "species",
  "benefit",
  "forest",
  "heritage",
  "info",
];

type Group = { category: Category; label: string; items: AreaOverlay[] };

function groupAreas(areas: AreaOverlay[]): Group[] {
  const byCat = new Map<Category, AreaOverlay[]>();
  for (const a of areas) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }
  return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((category) => ({
    category,
    label: byCat.get(category)![0].label,
    items: byCat.get(category)!,
  }));
}

/** Distinct names within a category (the species layers repeat the same label). */
function distinctNames(items: AreaOverlay[]): string[] {
  return [...new Set(items.map((i) => i.nimi || i.label))];
}

export function OverlayChips({ areas }: { areas: AreaOverlay[] }) {
  if (!areas || areas.length === 0) {
    return (
      <p className="text-[12.5px] italic text-muted-foreground">
        Ühtegi kitsendust ei tuvastatud — vaba kasutus, kehtivad üldised
        seadused.
      </p>
    );
  }

  const groups = groupAreas(areas);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const vars = CATEGORY_VARS[g.category];
        const names = distinctNames(g.items);
        return (
          <div key={g.category} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: vars.fg }}
                aria-hidden
              />
              <span className="rr-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {g.label}
                {g.items.length > 1 && ` · ${names.length}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-4">
              {names.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center rounded-md px-2 py-1 text-[11.5px] font-medium leading-tight"
                  style={{ background: vars.bg, color: vars.fg }}
                  title={name}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
