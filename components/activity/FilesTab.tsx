"use client";

export default function FilesTab({ activityId }: { activityId: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-neutral-600">
        (Plassholder) Filer-modul for aktivitet <span className="font-medium">{activityId}</span>.
      </div>
      <div className="rounded-xl border p-3">
        Her kan vi senere vise opplastede filer, kategorier (Bilder/Tekst/Musikk/Annet) og opplasting.
      </div>
    </div>
  );
}
