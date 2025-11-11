"use client";

export default function SessionsTab({ activityId }: { activityId: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-neutral-600">
        (Plassholder) Økter-modul for aktivitet <span className="font-medium">{activityId}</span>.
      </div>
      <div className="rounded-xl border p-3">
        Her kan vi senere vise planlagte økter/øvinger, med dato/klokkeslett, sted og “Legg til i kalender”.
      </div>
    </div>
  );
}
