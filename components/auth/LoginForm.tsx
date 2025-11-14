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
  const [bypassLoading, setBypassLoading] = useState(false);
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

  const bypassLogin = async () => {
    setErr(null);
    setBypassLoading(true);
    try {
      const res = await fetch("/api/dev-login", { method: "POST" });
      if (!res.ok) {
        throw new Error("Kunne ikke hoppe over innloggingen.");
      }
      const redirectTo = resolveRedirect();
      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Kunne ikke hoppe over innloggingen.";
      setErr(message);
    } finally {
      setBypassLoading(false);
    }
  };

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-200">
        <div className="mb-6 text-center">
          <img
            src="/Images/follies-logo.jpg"
            alt="Follies"
            className="mx-auto h-16 w-auto object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Logg inn</h1>
          <p className="text-sm text-slate-600">
            Bruk <span className="text-slate-900 font-medium">e-post</span> og passord.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">E-post</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input px-4 py-3"
              placeholder="din@epost.no"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Passord</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input px-4 py-3 pr-12"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-500 hover:text-slate-700"
              >
                {showPw ? "Skjul" : "Vis"}
              </button>
            </div>
          </div>

          {err && (
            <div className="rounded-lg border border-red-500/40 bg-red-50 px-4 py-3 text-red-700 text-sm">
              {err}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading || bypassLoading}
              className="w-full rounded-xl bg-red-600 hover:bg-red-700 transition px-4 py-3 font-semibold text-white disabled:opacity-60 disabled:hover:bg-red-600"
            >
              {loading ? "Logger inn …" : "Logg inn"}
            </button>
            <button
              type="button"
              onClick={bypassLogin}
              disabled={loading || bypassLoading}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {bypassLoading ? "Åpner uten passord …" : "Hopp over innlogging (midlertidig)"}
            </button>
          </div>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-slate-600">
          <Link
            href="/forgot-password"
            className="hover:text-slate-900 underline underline-offset-4"
          >
            Glemt passord?
          </Link>
          <Link
            href="/"
            className="hover:text-slate-900 underline underline-offset-4"
          >
            Tilbake til forsiden
          </Link>
        </div>
      </div>
    </main>
  );
}
