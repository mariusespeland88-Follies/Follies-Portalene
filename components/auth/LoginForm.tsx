"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolveRedirect = () => {
    if (typeof window === "undefined") return "/dashboard";
    const params = new URLSearchParams(window.location.search);
    return params.get("redirectTo") || "/dashboard";
  };

  // Hvis allerede innlogget → gå til dashboard
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace(resolveRedirect());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lytt på auth-endringer (hindrer “stuck” etter innlogging)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_IN") {
        const redirectTo = resolveRedirect();
        router.replace(redirectTo);
        router.refresh();
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!email.includes("@")) {
      setErr("Skriv inn e-postadressen din.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setErr(error.message || "Kunne ikke logge inn. Sjekk e-post og passord.");
      return;
    }

    // Fallback om event ikke rekker å fyre
    const redirectTo = resolveRedirect();
    router.replace(redirectTo);
    router.refresh();
  };

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-black/60 p-8 shadow-xl border border-white/10">
        <div className="mb-6 text-center">
          <img
            src="/Images/follies-logo.jpg"
            alt="Follies"
            className="mx-auto h-14 w-auto object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Logg inn</h1>
          <p className="text-sm text-neutral-300">
            Bruk <span className="text-white font-medium">e-post</span> og passord.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-200 mb-1">E-post</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-neutral-800 text-white px-4 py-3 outline-none border border-white/10 focus:border-red-500"
              placeholder="din@epost.no"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-200 mb-1">Passord</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-neutral-800 text-white px-4 py-3 outline-none border border-white/10 focus:border-red-500 pr-12"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-neutral-300 hover:text-white"
              >
                {showPw ? "Skjul" : "Vis"}
              </button>
            </div>
          </div>

          {err && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 hover:bg-red-700 transition px-4 py-3 font-semibold text-white disabled:opacity-60 disabled:hover:bg-red-600"
          >
            {loading ? "Logger inn …" : "Logg inn"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-neutral-300">
          <Link
            href="/forgot-password"
            className="hover:text-white underline underline-offset-4"
          >
            Glemt passord?
          </Link>
          <Link
            href="/"
            className="hover:text-white underline underline-offset-4"
          >
            Tilbake til forsiden
          </Link>
        </div>
      </div>
    </main>
  );
}
