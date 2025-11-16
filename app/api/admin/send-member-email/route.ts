import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@follies.no";

const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export async function POST(req: Request) {
  if (!supabaseAdmin || !SMTP_HOST || !SMTP_PORT) {
    return NextResponse.json(
      { error: "Supabase or SMTP configuration missing." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const memberId =
      typeof body?.memberId === "string" ? body.memberId.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const subject =
      typeof body?.subject === "string" ? body.subject.trim() : "";
    const text = typeof body?.body === "string" ? body.body.trim() : "";

    if (!email) {
      return NextResponse.json(
        { error: "Mangler e-postadresse for medlemmet." },
        { status: 400 }
      );
    }
    if (!text) {
      return NextResponse.json(
        { error: "Meldingen kan ikke være tom." },
        { status: 400 }
      );
    }

    if (memberId) {
      const { error: memberErr } = await supabaseAdmin
        .from("members")
        .select("id, email, first_name, last_name")
        .eq("id", memberId)
        .maybeSingle();
      if (memberErr) {
        console.warn("[send-member-email] Member lookup failed", memberErr);
      }
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: false,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });

    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: subject || "Melding fra Follies",
      text,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[send-member-email] Unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Kunne ikke sende e-post." },
      { status: 500 }
    );
  }
}
