import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Recert Flow Engine · App · PropOps8",
  robots: { index: false },
};

/* The engine is public/tools/recert/engine.html — a self-contained artifact
   export. This page frames it full-screen under propops8.com so users never
   leave the site. Its one window.claude reference (the save/export path)
   already checks `if (!window.claude)` and falls back to a plain browser
   download, so it works unmodified outside the Claude artifact sandbox. */
export default function RecertEngine() {
  return (
    <main style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", background: "#070d1c" }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px 16px", borderBottom: "1px solid rgba(120,170,255,.16)",
          font: "500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace", color: "#8e9ab3",
        }}
      >
        <Link href="/tools/recert" style={{ color: "#3ddce8", textDecoration: "none" }}>← Recert Flow Engine</Link>
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
