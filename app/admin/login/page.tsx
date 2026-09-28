"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push(params.get("from") || "/admin/review");
      router.refresh();
    } catch {
      setError("Network error -- try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070b14",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: "#111a2b",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          padding: "36px 32px",
          width: 340,
        }}
      >
        <div style={{ color: "#f4f8ff", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
          PROPOPS<span style={{ color: "#22d3ee" }}>8</span>
        </div>
        <div style={{ color: "#7f8ea8", fontSize: 12, letterSpacing: "0.08em", marginBottom: 24 }}>
          ADMIN
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0b1220",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "11px 12px",
            color: "#e6edf7",
            fontSize: 14,
            marginBottom: 14,
          }}
        />
        {error && (
          <div style={{ color: "#ff2d6b", fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: "#22d3ee",
            color: "#06202a",
            border: "none",
            borderRadius: 8,
            padding: "12px",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Checking..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
