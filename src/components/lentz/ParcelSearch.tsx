"use client";

import { useEffect, useId, useRef, useState } from "react";

// Autocomplete search over Estonian cadastral data. As the user types a place /
// forest / village / parcel name, the backend (/api/suggest → Maa-amet In-ADS)
// returns matching katastriüksused. Selecting one (or typing a raw tunnus)
// triggers onSearch with the katastritunnus the report endpoint expects.

interface Suggestion {
  tunnus: string;
  label: string;
  sub: string;
  lat: number | null;
  lon: number | null;
}

// Merged app: UI and API share the same origin, so default to relative URLs.
const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

const TUNNUS_RE = /^\d{5}:\d{3}:\d{4}$/;

export default function ParcelSearch({
  variant,
  initialValue = "",
  onSearch,
}: {
  variant: "hero" | "bar";
  initialValue?: string;
  onSearch: (query: string) => void;
}) {
  const hero = variant === "hero";
  const [value, setValue] = useState(initialValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced suggestion fetch. Skip when the query already looks like a full
  // katastritunnus — that's a direct lookup, no need to suggest.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || TUNNUS_RE.test(q)) {
      setItems([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${BACKEND}/api/suggest?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        if (cancelled) return;
        setItems(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setActive(-1);
      } catch {
        if (!cancelled) {
          setItems([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(t);
    };
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(s: Suggestion) {
    setValue(s.label);
    setOpen(false);
    onSearch(s.tunnus);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active >= 0 && items[active]) {
      choose(items[active]);
      return;
    }
    const q = value.trim();
    if (!q) return;
    // Raw katastritunnus → search directly; otherwise take the top suggestion.
    if (TUNNUS_RE.test(q)) {
      setOpen(false);
      onSearch(q);
    } else if (items[0]) {
      choose(items[0]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} className="w-full">
        <div
          className={`flex items-center gap-3 bg-white ring-1 ring-black/10 transition-all focus-within:ring-2 focus-within:ring-[#14130f] ${
            hero ? "rr-soft-glow rounded-xl px-5 py-4" : "rounded-lg px-4 py-2.5 shadow-sm"
          }`}
        >
          <svg
            className={`shrink-0 text-[#14130f]/50 ${hero ? "h-6 w-6" : "h-5 w-5"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.3-4.3m0 0A7.5 7.5 0 105.5 5.5a7.5 7.5 0 0011.2 11.2z"
            />
          </svg>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => items.length > 0 && setOpen(true)}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Otsi kohanime, küla või katastritunnust…"
            className={`w-full bg-transparent text-[#14130f] outline-none placeholder:text-[#14130f]/40 ${
              hero ? "text-lg" : "text-sm"
            }`}
          />
          {loading && (
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#14130f]/20 border-t-[#14130f]/60"
              aria-hidden
            />
          )}
          <button
            type="submit"
            className={`shrink-0 rounded-md bg-[#14130f] font-medium text-[#f1f0ea] transition hover:bg-[#14130f]/85 ${
              hero ? "px-5 py-2.5 text-base" : "px-3.5 py-1.5 text-sm"
            }`}
          >
            Otsi
          </button>
        </div>
      </form>

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-black/10 bg-white py-1 text-left shadow-xl"
        >
          {items.map((s, i) => (
            <li key={s.tunnus} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === active ? "bg-[#2f5d3a]/8" : "hover:bg-black/[0.03]"
                }`}
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#2f5d3a]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"
                  />
                  <circle cx="12" cy="11" r="2.5" />
                </svg>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#14130f]">
                    {s.label}
                  </span>
                  <span className="block truncate text-xs text-[#14130f]/50">
                    {s.sub}
                    <span className="ml-1.5 text-[#14130f]/35">· {s.tunnus}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
