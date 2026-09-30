import type { Metadata } from "next";
import RecertEngineClient from "./RecertEngineClient";

export const metadata: Metadata = {
  title: "Recert Flow Engine · App · PropOps8",
  robots: { index: false },
};

/* The engine is public/tools/recert/engine.html — a self-contained artifact
   export. This page frames it full-screen under propops8.com so users never
   leave the site. Its one window.claude reference (the save/export path)
   already checks `if (!window.claude)` and falls back to a plain browser
   download, so it works unmodified outside the Claude artifact sandbox.
   The iframe and its unsaved-work navigation guard (postMessage from the
   engine, a beforeunload listener, a confirm on the in-app back link) need
   browser APIs a Server Component can't use — a "use client" file also
   can't export metadata, hence the split into RecertEngineClient below. */
export default function RecertEngine() {
  return <RecertEngineClient />;
}
