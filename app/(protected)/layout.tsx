import * as React from "react";
import SupabaseBridge from "@/components/SupabaseBridge";
import AppHeader from "@/components/Layout/AppHeader";

/**
 * (protected) layout
 * - Holder toppbaren synlig på alle innloggede sider.
 * - Sørger for lys bakgrunn som matcher det opprinnelige designet.
 */

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <SupabaseBridge />
      <AppHeader />
      <main className="pb-16">{children}</main>
    </div>
  );
}
