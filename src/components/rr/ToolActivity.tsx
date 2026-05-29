"use client";

import { Check, Loader2, X } from "lucide-react";
import type { ToolEvent } from "@/lib/useRadar";
import { cn } from "@/lib/utils";

// The "see what the agent does" strip: one row per backend step (kataster sweep,
// Riigi Teataja eeskiri, AI synthesis), with live status. Reads like a quiet
// terminal log so the sourcing feels transparent rather than magical.
export function ToolActivity({ tools }: { tools: ToolEvent[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-surface-1/60 px-3 py-2.5">
      {tools.map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 text-[12.5px]">
          <span className="grid size-4 shrink-0 place-items-center">
            {t.status === "running" ? (
              <Loader2 className="size-3.5 animate-spin text-forest" />
            ) : t.status === "failed" ? (
              <X className="size-3.5 text-destructive" />
            ) : (
              <Check className="size-3.5 text-forest" />
            )}
          </span>
          <span className="rr-mono shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
            {t.name}
          </span>
          {t.detail && (
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-muted-foreground",
                t.status === "failed" && "text-destructive/80",
              )}
            >
              {t.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
