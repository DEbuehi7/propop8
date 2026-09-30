import type { Metadata } from "next";
import RecertEngineClient from "./RecertEngineClient";

export const metadata: Metadata = {
  title: "Recert Flow Engine · App · PropOps8",
  robots: { index: false },
};

/* The engine is public/tools/recert/engine.html — a self-contained artifact
   export, loaded in an iframe by RecertEngineClient so users never leave the
   site. The iframe and its unsaved-work navigation guard need browser APIs
   (postMessage, beforeunload) and so live in that Client Component — a
   "use client" file can't also export metadata, hence the split. */
export default function RecertEngine() {
  return <RecertEngineClient />;
}
