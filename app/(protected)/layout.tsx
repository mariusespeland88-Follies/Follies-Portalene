import * as React from "react";
import SupabaseBridge from "@/components/SupabaseBridge";

/**
 * (protected) layout
 * - Viser toppbaren som alltid har vært en del av portalen.
 * - Holder SupabaseBridge i DOM for å synkronisere auth ↔ localStorage.
 */

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SupabaseBridge />
      {children}
    </>
  );
}
