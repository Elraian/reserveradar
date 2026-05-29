"use client";

import { useState } from "react";

export default function SearchBar({
  variant,
  initialValue = "",
  onSearch,
}: {
  variant: "hero" | "bar";
  initialValue?: string;
  onSearch: (query: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim());
  }

  const hero = variant === "hero";

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={`flex items-center gap-3 bg-white shadow-sm ring-1 ring-black/10 transition-all focus-within:ring-2 focus-within:ring-[#14130f] ${
          hero ? "px-5 py-4" : "px-4 py-2.5"
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
          placeholder="Sisesta katastritunnus või aadress…"
          className={`w-full bg-transparent text-[#14130f] outline-none placeholder:text-[#14130f]/40 ${
            hero ? "text-lg" : "text-sm"
          }`}
        />
        <button
          type="submit"
          className={`shrink-0 bg-[#14130f] font-medium text-[#f1f0ea] transition hover:bg-[#14130f]/85 ${
            hero ? "px-5 py-2.5 text-base" : "px-3.5 py-1.5 text-sm"
          }`}
        >
          Otsi
        </button>
      </div>
    </form>
  );
}
