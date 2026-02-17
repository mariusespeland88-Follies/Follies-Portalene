// PATH: app/(protected)/layout.tsx
import * as React from "react";
import { redirect } from "next/navigation";
import SupabaseBridge from "@/components/SupabaseBridge";
import AppHeader from "@/components/Layout/AppHeader";
import { createClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * (protected) layout
 * - Beholder eksisterende toppbar og stil (den ligger i rot-layouten).
 * - Legger kun inn en usynlig SupabaseBridge som synker Auth ↔ localStorage.
 * - Ingen visuelle endringer.
 */

function uniqLower(items: string[]) {
  return Array.from(
    new Set(
      items
        .map((x) => String(x ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function canAccessPortal(roles: string[]) {
  return roles.some((role) =>
    ["leader", "leder", "staff", "admin"].includes(role)
  );
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const roles: string[] = [];
  const email = String(session.user.email ?? "").trim();
  const admin = getSupabaseServiceRoleClient();

  if (email) {
    const roleClient = admin ?? supabase;
    const { data } = await roleClient
      .from("members")
      .select("member_roles(role)")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    const rows = Array.isArray((data as any)?.member_roles)
      ? (data as any).member_roles
      : [];
    for (const row of rows) roles.push(String((row as any)?.role ?? ""));
  }

  // Fallback for eldre admin-oppsett
  const roleClient = admin ?? supabase;
  const { data: profile } = await roleClient
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if ((profile as any)?.role) roles.push(String((profile as any).role));

  if (!canAccessPortal(uniqLower(roles))) {
    redirect("/portal-only-staff");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SupabaseBridge />
      <AppHeader />
      <main className="bg-zinc-100 min-h-screen pb-16">{children}</main>
    </div>
  );
}
