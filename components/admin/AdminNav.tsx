"use client";

/**
 * components/admin/AdminNav.tsx
 * ----------------------------------------------------------------
 * One bar under the site header on every /admin page (login excepted),
 * so no admin screen is a dead end: Review, LVN, Plate8, Recert,
 * BRRRR, Infographics and the public site are all one tap away, and
 * "Admin" always goes back to the launchpad.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Admin home", exact: true },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/lvn", label: "LVN" },
  { href: "/plate", label: "Plate8" },
  { href: "/tools/recert", label: "Recert" },
  { href: "/brrrr", label: "BRRRR" },
  { href: "/infographics", label: "Infographics" },
  { href: "/", label: "Public site", exact: true },
];

export default function AdminNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  if (pathname.startsWith("/admin/login")) return null;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <nav
      aria-label="Admin"
      style={{
        position: "sticky",
        top: 56,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        overflowX: "auto",
        background: "#0b1220",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {LINKS.map((l) => {
        const active = l.exact
          ? pathname === l.href
          : pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              textDecoration: "none",
              color: active ? "#03edff" : "rgba(255,255,255,0.65)",
              background: active ? "rgba(3,237,255,0.10)" : "transparent",
            }}
          >
            {l.label}
          </Link>
        );
      })}
      <button
        onClick={logout}
        style={{
          marginLeft: "auto",
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "transparent",
          color: "rgba(255,255,255,0.65)",
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
