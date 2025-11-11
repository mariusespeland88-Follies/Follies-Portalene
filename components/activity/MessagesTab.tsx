"use client";

export default function MessagesTab({ activityId }: { activityId: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-neutral-600">
        (Plassholder) Meldinger-modul for aktivitet <span className="font-medium">{activityId}</span>.
      </div>
      <div className="rounded-xl border p-3">
        Her kan vi senere sende e-post/SMS til alle påmeldte/ledere, og vise meldingshistorikk.
      </div>
    </div>
  );
}
