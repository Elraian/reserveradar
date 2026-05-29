"use client";

import { useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { isValidTunnus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Cadastral-number input. Validates the NNNNN:NNN:NNNN shape before submit and
// surfaces the error inline (label-above / error-below per the design rules).
export function TunnusInput({
  onSend,
  onStop,
  streaming,
  autoFocus,
}: {
  onSend: (tunnus: string) => void;
  onStop: () => void;
  streaming: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const valid = isValidTunnus(trimmed);
  const showError = touched && trimmed.length > 0 && !valid;

  const submit = () => {
    if (!trimmed || streaming) return;
    if (!valid) {
      setTouched(true);
      return;
    }
    onSend(trimmed);
    setValue("");
    setTouched(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border bg-card px-4 py-2 shadow-sm transition-colors",
          showError
            ? "border-destructive/60"
            : "border-input focus-within:border-forest",
        )}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          inputMode="numeric"
          autoFocus={autoFocus}
          placeholder="Sisesta katastritunnus (nt 63902:001:0751)"
          aria-label="Katastritunnus"
          aria-invalid={showError}
          className="rr-mono min-w-0 flex-1 bg-transparent text-[15px] tracking-wide text-foreground outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Peata"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-transform active:scale-95"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!trimmed}
            aria-label="Vaata piiranguid"
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full transition-transform active:scale-95",
              trimmed
                ? "bg-primary text-primary-foreground hover:bg-forest-soft"
                : "cursor-not-allowed bg-surface-2 text-muted-foreground",
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {showError && (
        <p className="rr-mono pl-1 text-[11px] text-destructive">
          Kuju peab olema NNNNN:NNN:NNNN — viis numbrit, kolm, neli.
        </p>
      )}
    </div>
  );
}
