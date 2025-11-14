import { NextResponse } from "next/server";

const COOKIE_NAME = "dev_bypass";
const ONE_HOUR = 60 * 60;

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: "1",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
    maxAge: ONE_HOUR,
  });
  return res;
}
