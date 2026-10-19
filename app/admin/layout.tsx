import type { Metadata } from "next";
import AdminNav from "@/components/admin/AdminNav";

// On an iPhone home screen the back end gets its own name and icon, so it
// isn't mistaken for the public site. The icon is served from /public:
// everything under /admin needs a login, and an iPhone fetches it without one.
export const metadata: Metadata = {
  appleWebApp: { title: "PO8 Admin" },
  icons: { apple: [{ url: "/po8-admin-icon.png", sizes: "180x180" }] },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
