"use client";

// Simple front-of-house gate: a styled password screen (remembered in
// localStorage) instead of the browser's Basic-Auth dialog. Light-touch — keeps
// casual visitors out for the demo; it's not server-side security.
import { useEffect, useState } from "react";

const PASSWORD = "Futures123";
const KEY = "rr_unlocked";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null); // null = checking (avoid flash)
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    try {
      setOk(localStorage.getItem(KEY) === "1");
    } catch {
      setOk(false);
    }
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === PASSWORD) {
      try {
        localStorage.setItem(KEY, "1");
      } catch {}
      setOk(true);
    } else {
      setErr(true);
    }
  }

  if (ok === null) return null; // brief checking state
  if (ok) return <>{children}</>;

  return (
    <div className="lentz flex min-h-dvh flex-col items-center justify-center bg-[#f1f0ea] px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight text-[#14130f]">◎ Reserve Radar</h1>
        <p className="mt-2 text-sm text-[#14130f]/55">Sisesta parool, et jätkata.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr(false);
            }}
            placeholder="Parool"
            className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-center text-[#14130f] outline-none focus:border-[#2f5d3a] focus:ring-1 focus:ring-[#2f5d3a]/40"
          />
          {err && <p className="text-sm text-red-600">Vale parool.</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-[#14130f] px-4 py-2.5 font-medium text-[#f1f0ea] transition hover:bg-[#14130f]/90"
          >
            Sisene
          </button>
        </form>
      </div>
    </div>
  );
}
