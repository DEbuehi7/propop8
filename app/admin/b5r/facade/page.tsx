import type { Metadata } from "next";
import FacadeWorkbench from "@/components/b5r/facade/FacadeWorkbench";

// Behind the admin login (proxy.ts gates /admin). The workbench runs
// entirely in the browser on the synthetic fixture or a project file the
// user loads; nothing is stored or sent.
export const metadata: Metadata = { title: "Façade Intelligence · AIM-B5R · Admin", robots: { index: false } };

export default function FacadePage() {
  return <FacadeWorkbench />;
}
