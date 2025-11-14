"use client";

import { useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Props = {
  memberId: string;
  value?: string | null;
  onSaved?: (url: string) => void;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // ⬅️ ØKT TIL 10 MB

export default function UploadProfilePicture({ memberId, value, onSaved }: Props) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(value ?? null);

  async function handleFile(file: File) {
    setMsg(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg("Velg en bildefil."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setMsg("Maks 10 MB."); return; } // ⬅️

    setUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { setMsg("Du må være innlogget."); return; }

      const BUCKET = "profile-pictures";
      const path = `members/${memberId}/${Date.now()}-${file.name}`;

      const { error: upErr } = await supabase
        .storage.from(BUCKET)
        .upload(path, file, { upsert: false, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = data.publicUrl;
      setPreview(url);

      const { error: updErr } = await supabase
        .from("members")
        .update({ avatar_url: url })
        .eq("id", String(memberId));
      if (updErr) throw updErr;

      setMsg("Bilde lagret ✅");
      onSaved?.(url);
    } catch (e: any) {
      setMsg(e?.message || "Feil ved opplasting/lagring.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview || "/Images/follies-logo.jpg"}
        alt="Profilbilde"
        className="h-full w-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/Images/follies-logo.jpg"; }}
      />

      <button
        type="button"
        className="absolute bottom-1 right-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white hover:bg-black/80"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Laster…" : "Velg"}
      </button>
      {msg && (
        <span className="absolute left-1 bottom-1 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white/90">
          {msg}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
