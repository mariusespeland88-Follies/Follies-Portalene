"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Args = {
  file: File;
  memberId: string;
};

export async function uploadMemberAvatar({ file, memberId }: Args): Promise<string> {
  const supabase = createClientComponentClient();

  if (!file.type.startsWith("image/")) throw new Error("Velg en bildefil.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Maks 5 MB.");

  const BUCKET = "profile-pictures"; // public bucket
  const path = `members/${memberId}/${Date.now()}-${file.name}`;

  // 1) Last opp fil
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type,
  });
  if (up.error) throw up.error;

  // 2) Hent public URL
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl;

  // 3) Lagre i DB
  const upd = await supabase.from("members").update({ avatar_url: url }).eq("id", memberId);
  if (upd.error) throw upd.error;

  return url; // ferdig
}
