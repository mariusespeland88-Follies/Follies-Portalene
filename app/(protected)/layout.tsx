import * as React from "react";
import SupabaseBridge from "@/components/SupabaseBridge";
import Navbar from "@/app/components/Navbar";

/**
 * (protected) layout
 * - Viser toppbaren som alltid har vært en del av portalen.
 * - Holder SupabaseBridge i DOM for å synkronisere auth ↔ localStorage.
 */

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SupabaseBridge />
      <Navbar />
      <main className="min-h-screen bg-gray-900 text-gray-100">
        {children}
      </main>
    </>
  );
}
