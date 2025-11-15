import * as React from "react";
import SupabaseBridge from "@/components/SupabaseBridge";
import AppHeader from "@/components/Layout/AppHeader";

/**
 * (protected) layout
 * - Beholder eksisterende toppbar og stil (den ligger i rot-layouten).
 * - Legger kun inn en usynlig SupabaseBridge som synker Auth ↔ localStorage.
 * - Ingen visuelle endringer.
 */

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SupabaseBridge />
      <AppHeader />
      <main className="bg-zinc-100 min-h-screen pb-16">{children}</main>
    </div>
  );
}
