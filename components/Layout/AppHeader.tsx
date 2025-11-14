"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import getSupabaseBrowserClient from "@/lib/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/members", label: "Medlemmer" },
  { href: "/activities", label: "Aktiviteter" },
  { href: "/calendar", label: "Kalender" },
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function readLS(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseJSON<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function sanitizePart(part: string | null | undefined) {
  if (!part) return "";
  return titleCase(
    String(part)
      .replace(/\d+/g, "")
      .replace(/[_\-.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function combineName(
  firstName?: string | null,
  lastName?: string | null,
  fullName?: string | null
) {
  const fullSan = sanitizePart(fullName);
  const fnSan = sanitizePart(firstName);
  const lnSan = sanitizePart(lastName);
  const combo = [fnSan, lnSan].filter(Boolean).join(" ").trim();
  return titleCase(combo || fullSan);
}

function humanFromEmail(email: string): string {
  const localPart = email.split("@")[0] || "";
  const cleaned = localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.replace(/\d+/g, ""))
    .filter(Boolean);
  const pretty = cleaned.join(" ").trim();
  return pretty ? titleCase(pretty) : email;
}

export default function AppHeader() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { isAdmin: isAdminFromHook } = usePermissions();
  const pathname = usePathname();

  const [email, setEmail] = React.useState<string | null>(null);
  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const [isAdminDirectDB, setIsAdminDirectDB] = React.useState(false);

  async function refreshIdentity() {
    const { data } = await supabase.auth.getSession();
    const sessionEmail = data.session?.user?.email ?? null;
    setEmail(sessionEmail);

    setIsAdminDirectDB(false);
    let nameFromDB: string | null = null;

    if (sessionEmail) {
      try {
        const { data: rows, error } = await supabase
          .from("members")
          .select(
            "first_name, last_name, full_name, name, email, member_roles ( role )"
          )
          .ilike("email", sessionEmail)
          .limit(1);

        if (!error && rows && rows.length > 0) {
          const record = rows[0] as any;
          nameFromDB =
            combineName(
              record.first_name,
              record.last_name,
              record.full_name ?? record.name ?? null
            ) || null;

          const roles = Array.isArray(record.member_roles)
            ? record.member_roles.map((role: any) =>
                String(role.role ?? role).toLowerCase()
              )
            : [];

          if (roles.includes("admin")) {
            setIsAdminDirectDB(true);
          }
        }
      } catch {
        // Ignorer – vi faller tilbake til localStorage.
      }
    }

    if (!nameFromDB && sessionEmail) {
      const cachedMembers = parseJSON<any[]>(readLS("follies.members.v1"), []);
      const fallback = cachedMembers.find((member) => {
        const memberEmail = String(
          member?.email ?? member?.epost ?? member?.mail ?? ""
        ).toLowerCase();
        return memberEmail === sessionEmail.toLowerCase();
      });

      if (fallback) {
        const pretty = combineName(
          fallback.first_name ?? fallback.fornavn,
          fallback.last_name ?? fallback.etternavn,
          fallback.full_name ?? fallback.name ?? fallback.navn ?? null
        );
        setDisplayName(pretty || humanFromEmail(sessionEmail));
      } else {
        setDisplayName(humanFromEmail(sessionEmail));
      }
    } else if (sessionEmail) {
      setDisplayName(nameFromDB || humanFromEmail(sessionEmail));
    } else {
      setDisplayName(null);
    }
  }

  React.useEffect(() => {
    refreshIdentity();

    const handleAuth = () => refreshIdentity();
    const handleMemberSync = () => refreshIdentity();

    try {
      window.addEventListener("follies:auth-sync", handleAuth);
    } catch {
      /* noop */
    }

    try {
      window.addEventListener("follies:member-sync", handleMemberSync);
    } catch {
      /* noop */
    }

    return () => {
      try {
        window.removeEventListener("follies:auth-sync", handleAuth);
      } catch {
        /* noop */
      }

      try {
        window.removeEventListener("follies:member-sync", handleMemberSync);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSignOut() {
    try {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } catch {
      /* noop */
    }
  }

  const showAdmin = isAdminFromHook || isAdminDirectDB;

  const renderNavLink = (href: string, label: string) => {
    const isActive = pathname === href || pathname?.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        className={cx(
          "whitespace-nowrap text-sm font-medium transition-colors",
          isActive
            ? "text-slate-900"
            : "text-slate-600 hover:text-slate-900"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="relative z-20 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="relative mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="sr-only">Til forsiden</span>
            <img
              src="/Images/follies-logo.jpg"
              alt="Follies"
              className="h-12 w-auto"
            />
          </Link>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
              Ansattportal
            </span>
            <span className="text-lg font-semibold text-slate-900">Follies Portal</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => renderNavLink(item.href, item.label))}
          {showAdmin ? (
            <Link
              href="/admin"
              className="text-slate-600 transition-colors hover:text-slate-900"
              title="Admin"
              aria-label="Admin"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className={cx(
                  "transition-transform",
                  pathname?.startsWith("/admin") && "text-slate-900"
                )}
              >
                <path d="M12 2l7 3v6c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V5l7-3z" />
              </svg>
            </Link>
          ) : null}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          {email ? (
            <>
              <div className="hidden min-w-[140px] flex-col text-xs leading-tight text-slate-500 sm:flex">
                <span className="flex items-center gap-2 text-slate-900">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                  Innlogget
                </span>
                <span className="max-w-[220px] truncate text-sm text-slate-600">
                  {displayName || email}
                </span>
              </div>
              <button
                onClick={onSignOut}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Logg ut
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-red-500"
            >
              Logg inn
            </Link>
          )}
        </div>
      </div>

      <div className="relative border-t border-slate-200 bg-white md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-4 py-2 text-sm">
          {NAV_ITEMS.map((item) => (
            <div key={item.href}>{renderNavLink(item.href, item.label)}</div>
          ))}
          {showAdmin ? (
            <Link
              href="/admin"
              className={cx(
                "flex items-center gap-1 whitespace-nowrap text-slate-600 transition-colors hover:text-slate-900",
                pathname?.startsWith("/admin") && "text-slate-900"
              )}
              title="Admin"
              aria-label="Admin"
            >
              🛡️ Admin
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
