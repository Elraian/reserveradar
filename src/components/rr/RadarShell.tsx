"use client";

import { useState } from "react";
import { useRadar } from "@/lib/useRadar";
import { Sidebar } from "./Sidebar";
import { ChatThread } from "./ChatThread";
import { ContextPanel } from "./ContextPanel";

// Three-column shell: sessions · streaming thread · map + sources panel.
// Left + right panels collapse to thin rails (Viltrum-style) to give the
// thread more room — handy on smaller screens and for a clean demo.
export function RadarShell() {
  const { turns, parcel, streaming, recents, send, stop, reset } = useRadar();
  const activeTunnus = parcel?.tunnus ?? null;
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        open={leftOpen}
        onToggle={() => setLeftOpen((o) => !o)}
        recents={recents}
        activeTunnus={activeTunnus}
        onNew={reset}
        onOpen={send}
      />
      <ChatThread turns={turns} streaming={streaming} onSend={send} onStop={stop} />
      <ContextPanel
        open={rightOpen}
        onToggle={() => setRightOpen((o) => !o)}
        parcel={parcel}
      />
    </div>
  );
}
