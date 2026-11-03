import type { Metadata } from "next";
import AdminNav from "@/components/admin/AdminNav";

// On an iPhone home screen the back end gets its own name, icon and
// full-screen manifest ("PropOps8 Ops"), so it isn't mistaken for the public
// site. Both files are served from /public: everything under /admin needs a
// login, and an iPhone fetches them without one.
export const metadata: Metadata = {
  appleWebApp: { title: "PropOps8 Ops" },
  icons: { apple: [{ url: "/po8-admin-icon.png", sizes: "180x180" }] },
  manifest: "/propops8-ops.webmanifest",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
