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

function missingSmtpConfig() {
  return !SMTP_HOST;
}

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin-klient er ikke konfigurert." },
      { status: 500 }
    );
  }

  if (missingSmtpConfig()) {
    return NextResponse.json(
      { error: "SMTP er ikke konfigurert på serveren." },
      { status: 500 }
    );
  }

  try {
    const payload = await req.json();
    const memberId = payload?.memberId ? String(payload.memberId) : undefined;
    const subject = typeof payload?.subject === "string" ? payload.subject : "";
    const rawEmail = typeof payload?.email === "string" ? payload.email : "";
    const rawBody = typeof payload?.body === "string" ? payload.body : "";

    const email = rawEmail.trim();
    const body = rawBody.trim();

    if (!email) {
      return NextResponse.json(
        { error: "E-postadresse mangler." },
        { status: 400 }
      );
    }

    if (!body) {
      return NextResponse.json(
        { error: "Meldingen kan ikke være tom." },
        { status: 400 }
      );
    }

    let targetEmail = email;

    if (memberId) {
      const { data, error } = await supabaseAdmin
        .from("members")
        .select("id, email")
        .eq("id", memberId)
        .maybeSingle();
      if (error) {
        console.warn("[send-member-email] Klarte ikke hente medlem", error);
      }
      const dbEmail = data?.email?.trim();
      if (dbEmail && dbEmail !== targetEmail) {
        console.warn(
          `[send-member-email] E-post i payload (${targetEmail}) matcher ikke databasen (${dbEmail}). Bruker databasen.`
        );
        targetEmail = dbEmail;
      }
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: false,
      auth:
        SMTP_USER && SMTP_PASS
          ? {
              user: SMTP_USER,
              pass: SMTP_PASS,
            }
          : undefined,
    });

    await transporter.sendMail({
      from: EMAIL_FROM,
      to: targetEmail,
      subject: subject?.trim() || "Melding fra Follies",
      text: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[send-member-email] Klarte ikke sende e-post", error);
    return NextResponse.json(
      { error: error?.message || "Kunne ikke sende e-post." },
      { status: 500 }
    );
  }
}
