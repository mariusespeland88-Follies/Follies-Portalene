// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import AppHeader from '../components/layout/AppHeader';

export const metadata: Metadata = { title: 'Follies Portal' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body className="min-h-screen bg-neutral-50">
        <AppHeader />
        <main className="mx-auto max-w-6xl p-4">{children}</main>
      </body>
    </html>
  );
}
