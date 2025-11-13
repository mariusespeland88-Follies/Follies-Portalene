import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  // Viktig: bruk denne responsen slik at Supabase kan lese/skrive cookies
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const devBypass = req.cookies.get("dev_bypass")?.value === "1";

  const { pathname, searchParams } = req.nextUrl;

  // Hvilke ruter er offentlige
  const isPublicPath =
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/auth/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/_next");

  // Ikke innlogget → send til /login (behold cookies fra res)
  if (!session && !devBypass && !isPublicPath) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set(
      "redirectTo",
      pathname + (searchParams.size ? `?${searchParams}` : "")
    );
    const redirectRes = NextResponse.redirect(url);
    // Videresend set-cookie-headere fra res slik at login ikke mister dem
    res.headers.forEach((value, key) => redirectRes.headers.set(key, value));
    return redirectRes;
  }

  // Innlogget → hold dem unna /login
  if ((session || devBypass) && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirectRes = NextResponse.redirect(url);
    res.headers.forEach((value, key) => redirectRes.headers.set(key, value));
    return redirectRes;
  }

  // Ellers: slipp igjennom (med cookies intakte)
  return res;
}

// Matcher alt unntatt Next sine statiske filer, bilder og API
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|public|api).*)"],
};
