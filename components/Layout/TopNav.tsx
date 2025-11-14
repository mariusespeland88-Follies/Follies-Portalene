'use client';

import { usePathname } from 'next/navigation';

export default function TopNav({
  isAdmin,
  displayName,
}: {
  isAdmin: boolean;
  displayName: string;
}) {
  const pathname = usePathname();

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/members',   label: 'Medlemmer' },
    { href: '/activities',label: 'Aktiviteter' },
    { href: '/archive',   label: 'Arkiv' },
    { href: '/calendar',  label: 'Kalender' },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 border-b border-white/10 bg-black px-4 py-3 text-white">
      {/* Venstre: logo + hovedmeny */}
      <div className="flex items-center gap-3">
        <a href="/dashboard" className="font-semibold text-white">
          Follies Ansattportal
        </a>
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map(link => (
            <a
              key={link.href}
              href={link.href}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                isActive(link.href)
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              ].join(' ')}
            >
              {link.label}
            </a>
          ))}

          {isAdmin && (
            <a
              href="/admin"
              title="Admin"
              className="ml-1 inline-flex rounded-lg px-2 py-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Admin"
            >
              {/* Skjold-ikon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-current">
                <path d="M12 2l7 3v6c0 5-3.5 9.5-7 11-3.5-1.5-7-6-7-11V5l7-3zM7 8v3c0 3.7 2.4 7.5 5 8.9 2.6-1.4 5-5.2 5-8.9V8l-5-2.1L7 8z"/>
              </svg>
            </a>
          )}
        </nav>
      </div>

      {/* Høyre: innlogget-indikator + navn + logout */}
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden items-center gap-1 text-xs text-white/60 sm:inline-flex">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
          Innlogget
        </span>
        <span className="text-white/80">{displayName}</span>
        <form action="/logout" method="post">
          <button className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 font-semibold text-white transition hover:bg-white/20">
            Logg ut
          </button>
        </form>
      </div>
    </div>
  );
}
