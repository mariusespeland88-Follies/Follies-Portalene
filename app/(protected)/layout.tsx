import * as React from "react";
import SupabaseBridge from "@/components/SupabaseBridge";

/**
 * (protected) layout
 * - Beholder eksisterende toppbar og stil (den ligger i rot-layouten).
 * - Legger kun inn en usynlig SupabaseBridge som synker Auth ↔ localStorage.
 * - Ingen visuelle endringer.
 */

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SupabaseBridge />
      {children}
    </>
  );
}
