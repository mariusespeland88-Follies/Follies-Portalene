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
        const qs = new URLSearchParams();
        qs.set("email", sessionEmail);
        qs.set("limit", "1");

        const res = await fetch(`/api/members/list?${qs.toString()}`, {
          cache: "no-store",
        });

        if (res.ok) {
          const payload = await res.json().catch(() => ({}));
          const rows = Array.isArray(payload?.members)
            ? (payload.members as any[])
            : [];
          const record = rows[0];
          if (record) {
            nameFromDB =
              combineName(record.first_name, record.last_name, null) || null;

            const id = String(record.id ?? "");
            const rolesEntry = payload?.roles?.[id];
            const roles = Array.isArray(rolesEntry?.roles)
              ? rolesEntry.roles.map((role: any) =>
                  String(role ?? "").toLowerCase()
                )
              : [];
            if (roles.includes("admin")) {
              setIsAdminDirectDB(true);
            }

            // Hold localStorage i synk slik at resten av appen har et fallback.
            try {
              const raw = window.localStorage.getItem("follies.members.v1");
              const list = raw ? JSON.parse(raw) : [];
              const map = new Map(
                Array.isArray(list)
                  ? list.map((item: any) => [String(item?.id ?? item?.uuid ?? item?._id ?? ""), item])
                  : []
              );
              if (id) {
                const prev = map.get(id) || {};
                map.set(id, { ...prev, ...record });
                window.localStorage.setItem(
                  "follies.members.v1",
                  JSON.stringify(Array.from(map.values()))
                );

                const permsRaw = window.localStorage.getItem(
                  "follies.perms.v1"
                );
                const perms = permsRaw ? JSON.parse(permsRaw) : {};
                perms[id] = { roles };
                window.localStorage.setItem(
                  "follies.perms.v1",
                  JSON.stringify(perms)
                );
              }
            } catch {
              /* noop */
            }
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
          "whitespace-nowrap text-base font-semibold transition-colors",
          isActive
            ? "text-white"
            : "text-white/70 hover:text-white"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="relative z-20 border-b border-slate-800 bg-slate-900 text-white">
      <div className="relative mx-auto flex h-20 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex h-full items-center gap-4">
          <Link href="/" className="flex h-full items-center gap-3">
            <span className="sr-only">Til forsiden</span>
            <img
              src="/Images/follies-logo.jpg"
              alt="Follies"
              className="h-full w-auto max-h-20 object-contain"
            />
          </Link>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
              Ansattportal
            </span>
            <span className="text-xl font-semibold text-white">Follies Portal</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map((item) => renderNavLink(item.href, item.label))}
          {showAdmin ? (
            <Link
              href="/admin"
              className="text-white/70 transition-colors hover:text-white"
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
                  pathname?.startsWith("/admin") && "text-white"
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
              <div className="hidden min-w-[140px] flex-col text-xs leading-tight text-white/60 sm:flex">
                <span className="flex items-center gap-2 text-white">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                  Innlogget
                </span>
                <span className="max-w-[220px] truncate text-sm text-white/80">
                  {displayName || email}
                </span>
              </div>
              <button
                onClick={onSignOut}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 font-semibold text-white shadow-sm transition hover:bg-white/20"
              >
                Logg ut
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-900 shadow-sm hover:bg-slate-100"
            >
              Logg inn
            </Link>
          )}
        </div>
      </div>

      <div className="relative border-t border-slate-800 bg-slate-900 md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-4 py-3 text-sm">
          {NAV_ITEMS.map((item) => (
            <div key={item.href}>{renderNavLink(item.href, item.label)}</div>
          ))}
          {showAdmin ? (
            <Link
              href="/admin"
              className={cx(
                "flex items-center gap-1 whitespace-nowrap text-white/70 transition-colors hover:text-white",
                pathname?.startsWith("/admin") && "text-white"
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
