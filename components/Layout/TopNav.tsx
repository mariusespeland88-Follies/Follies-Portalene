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
    <div className="mx-auto max-w-6xl flex items-center justify-between p-3">
      {/* Venstre: logo + hovedmeny */}
      <div className="flex items-center gap-3">
        <a href="/dashboard" className="font-semibold">Follies Ansattportal</a>
        <nav className="hidden sm:flex items-center gap-1">
          {links.map(link => (
            <a
              key={link.href}
              href={link.href}
              className={[
                'px-3 py-1.5 rounded-lg',
                'text-white/85 hover:text-white hover:bg-white/10',
                isActive(link.href) ? 'text-white bg-white/15' : '',
              ].join(' ')}
            >
              {link.label}
            </a>
          ))}

          {isAdmin && (
            <a
              href="/admin"
              title="Admin"
              className="ml-1 px-2 py-1.5 rounded-lg hover:bg-white/10 inline-flex"
              aria-label="Admin"
            >
              {/* Skjold-ikon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white/90">
                <path d="M12 2l7 3v6c0 5-3.5 9.5-7 11-3.5-1.5-7-6-7-11V5l7-3zM7 8v3c0 3.7 2.4 7.5 5 8.9 2.6-1.4 5-5.2 5-8.9V8l-5-2.1L7 8z"/>
              </svg>
            </a>
          )}
        </nav>
      </div>

      {/* Høyre: innlogget-indikator + navn + logout */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-white/80">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Innlogget
        </span>
        <span className="text-sm">{displayName}</span>
        <form action="/logout" method="post">
          <button className="text-sm border border-white/20 rounded-lg px-3 py-1.5 hover:bg-white/10">
            Logg ut
          </button>
        </form>
      </div>
    </div>
  );
}
