// PATH: app/api/activities/[id]/broadcast/route.ts
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@follies.no";
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

type Target =
  | "participants"
  | "leaders"
  | "volunteers"
  | "guests"
  | "all-members";

type Channel = "email" | "messenger" | "both";

const isLeaderRole = (role: string | null | undefined) => {
  const r = String(role || "").toLowerCase();
  return r === "leader" || r === "leder" || r === "admin" || r === "edit";
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const activityId = String(params?.id || "").trim();
    if (!activityId)
      return NextResponse.json(
        { error: "Mangler aktivitets-ID." },
        { status: 400 }
      );

    const body = await req.json().catch(() => ({}));
    const subject = String(body?.subject || "").trim();
    const text = String(body?.body || "").trim();
    const target = (String(body?.target || "participants").trim() ||
      "participants") as Target;
    const channel = (String(body?.channel || "both").trim() ||
      "both") as Channel;
    const sendEmail = channel === "email" || channel === "both";
    const sendMessenger = channel === "messenger" || channel === "both";

    if (!subject) {
      return NextResponse.json(
        { error: "Emne må fylles ut." },
        { status: 400 }
      );
    }
    if (!text) {
      return NextResponse.json(
        { error: "Meldingstekst må fylles ut." },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceRoleClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server mangler Supabase-konfigurasjon." },
        { status: 500 }
      );
    }

    const memberIds = new Set<string>();

    // Enrollments (deltakere/ledere)
    const { data: enr, error: enrErr } = await db
      .from("enrollments")
      .select("member_id, role")
      .eq("activity_id", activityId);
    if (enrErr) throw enrErr;
    const enrollments = Array.isArray(enr) ? enr : [];
    enrollments.forEach((row: any) => {
      const mid = String(row?.member_id || "").trim();
      if (!mid) return;
      if (target === "leaders" && isLeaderRole(row?.role)) {
        memberIds.add(mid);
      } else if (target === "participants" && !isLeaderRole(row?.role)) {
        memberIds.add(mid);
      } else if (target === "all-members") {
        memberIds.add(mid);
      }
    });

    // Frivillige
    if (target === "volunteers" || target === "all-members") {
      const { data: vols, error: volErr } = await db
        .from("activity_volunteers")
        .select("member_id")
        .eq("activity_id", activityId);
      if (volErr) throw volErr;
      (Array.isArray(vols) ? vols : []).forEach((row: any) => {
        const mid = String(row?.member_id || "").trim();
        if (mid) memberIds.add(mid);
      });
    }

    // Slå opp medlemsinfo (for e-post/messenger)
    const memberInfos: { id: string; email: string | null; name: string }[] =
      [];
    if (memberIds.size) {
      const { data: members, error: memErr } = await db
        .from("members")
        .select("id, email, first_name, last_name")
        .in("id", Array.from(memberIds));
      if (memErr) throw memErr;
      (Array.isArray(members) ? members : []).forEach((m: any) => {
        memberInfos.push({
          id: String(m?.id || ""),
          email: (m?.email || "").trim() || null,
          name: `${m?.first_name || ""} ${m?.last_name || ""}`.trim() || "Ukjent",
        });
      });
    }

    // Gjester (epost)
    const guestEmails: { email: string; name: string }[] = [];
    if (target === "guests") {
      const { data: guests, error: guestErr } = await db
        .from("activity_guests")
        .select("first_name, last_name, email")
        .eq("activity_id", activityId);
      if (guestErr) throw guestErr;
      (Array.isArray(guests) ? guests : []).forEach((g: any) => {
        const email = String(g?.email || "").trim();
        if (email) {
          const name =
            `${g?.first_name || ""} ${g?.last_name || ""}`.trim() || "Gjest";
          guestEmails.push({ email, name });
        }
      });
    }

    // Send messenger-meldinger til medlemmer (lagre i messages-tabell)
    let messengerCount = 0;
    if (sendMessenger && memberInfos.length) {
      const rows = memberInfos.map((m) => ({
        member_id: m.id,
        activity_id: activityId,
        scope: "activity",
        target,
        subject,
        body: text,
        created_by_email: null,
        created_by_name: null,
      }));
      const { error: msgErr } = await db.from("messages").insert(rows);
      if (msgErr) throw msgErr;
      messengerCount = rows.length;
    }

    // Send e-post
    let emailCount = 0;
    if (sendEmail) {
      const emails: { email: string; name: string }[] = [];
      memberInfos.forEach((m) => {
        if (m.email) emails.push({ email: m.email, name: m.name });
      });
      guestEmails.forEach((g) => emails.push(g));

      if (emails.length) {
        if (!SMTP_HOST || !SMTP_PORT) {
          return NextResponse.json(
            { error: "SMTP-oppsett mangler (kan ikke sende e-post)." },
            { status: 500 }
          );
        }

        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: Number(SMTP_PORT) || 587,
          secure: false,
          auth:
            SMTP_USER && SMTP_PASS
              ? { user: SMTP_USER, pass: SMTP_PASS }
              : undefined,
        });

        await Promise.all(
          emails.map((e) =>
            transporter.sendMail({
              from: EMAIL_FROM,
              to: e.email,
              subject,
              text,
            })
          )
        );
        emailCount = emails.length;
      }
    }

    return NextResponse.json({
      ok: true,
      emailCount,
      messengerCount,
      recipients: memberInfos.length + guestEmails.length,
    });
  } catch (err: any) {
    console.error("[activity-broadcast] error", err);
    return NextResponse.json(
      { error: err?.message || "Kunne ikke sende meldingen." },
      { status: 500 }
    );
  }
}
