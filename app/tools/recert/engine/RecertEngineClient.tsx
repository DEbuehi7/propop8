"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

/* The embedded engine.html posts {source:"propops8-recert-engine", dirty}
   whenever its in-memory household data changes (see the "parent-frame
   guard" block near the end of that file's <script>). It holds all data
   only in this browser tab by design — nothing is ever sent anywhere —
   which also means navigating away silently discards it. This component
   turns that signal into two guards: the browser's own prompt for a real
   navigation (back button, reload, closing the tab), and a confirm before
   the in-app back link, since client-side route changes never trigger
   beforeunload at all. */
export default function RecertEngineClient() {
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e?.data?.source === "propops8-recert-engine") setDirty(!!e.data.dirty);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function handleBackClick(e: MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm("You have unsaved household data in the recert tool. Leave without exporting it first?")) {
      e.preventDefault();
    }
  }

  return (
    <main style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", background: "#070d1c" }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px 16px", borderBottom: "1px solid rgba(120,170,255,.16)",
          font: "500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace", color: "#8e9ab3",
        }}
      >
        <Link href="/tools/recert" onClick={handleBackClick} style={{ color: "#3ddce8", textDecoration: "none" }}>← Recert Flow Engine</Link>
        <span>PropOps8</span>
      </header>
      <iframe
        src="/tools/recert/engine.html"
        title="PropOps8 Recert Flow Engine"
        style={{ flex: 1, width: "100%", border: 0 }}
      />
    </main>
  );
}
