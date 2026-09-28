import type { Metadata } from "next";
import AdminLaunchpad from "@/components/admin/AdminLaunchpad";

export const metadata: Metadata = { title: "Admin · PropOps8", robots: { index: false } };

export default function AdminHome() {
  return (
    <main>
      <AdminLaunchpad />
    </main>
  );
}
