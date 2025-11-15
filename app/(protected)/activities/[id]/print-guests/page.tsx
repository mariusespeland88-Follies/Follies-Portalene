
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import Link from "next/link";

function PrintButton() {
  "use client";
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 print:hidden"
    >
      Skriv ut
    </button>
  );
}

type GuestRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  children: {
    id: string;
    first_name: string | null;
    age: number | null;
    gender: string | null;
    notes: string | null;
  }[];
};

type ActivityRow = {
  id: string;
  name: string | null;
};

function childDescription(child: GuestRow["children"][number]) {
  const parts: string[] = [];
  if (child.first_name) parts.push(child.first_name);
  if (typeof child.age === "number" && !Number.isNaN(child.age)) {
    parts.push(`${child.age} år`);
  }
  if (child.gender) parts.push(child.gender);
  if (child.notes) parts.push(child.notes);
  return parts.join(" · ") || "Barn";
}

export default async function PrintGuestsPage({
  params,
}: {
  params: { id: string };
}) {
  const activityId = params.id;
  const supabase = getSupabaseServiceRoleClient();

  let activity: ActivityRow | null = null;
  let guestList: GuestRow[] = [];

  if (supabase) {
    const [{ data: activityData }, { data: guests, error: guestsError }] = await Promise.all([
      supabase
        .from("activities")
        .select("id, name")
        .eq("id", activityId)
        .single(),
      supabase
        .from("activity_guests")
        .select(
          "id, first_name, last_name, phone, email, notes, children:activity_guest_children(id, first_name, age, gender, notes)"
        )
        .eq("activity_id", activityId)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
    ]);

    activity = (activityData as ActivityRow | null) ?? null;
    if (guestsError) {
      console.error("Kunne ikke hente gjester:", guestsError.message);
    }
    guestList = (guests as GuestRow[] | null) ?? [];
  }

  return (
    <div className="min-h-screen bg-white p-8 text-neutral-900 print:p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gjester – {activity?.name ?? "Aktivitet"}</h1>
          <p className="text-sm text-neutral-600">Skrivevennlig oversikt over registrerte gjester og barn.</p>
        </div>
        <PrintButton />
      </header>

      <div className="mt-4 flex items-center justify-between gap-2 print:hidden">
        <Link
          href={`/activities/${activityId}`}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
        >
          Tilbake til aktivitet
        </Link>
      </div>

      <table className="mt-6 w-full table-fixed border-collapse text-sm text-neutral-900">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="pb-2">Navn</th>
            <th className="pb-2">Telefon</th>
            <th className="pb-2">Barn</th>
            <th className="pb-2">Notater</th>
            <th className="pb-2">Møtt</th>
          </tr>
        </thead>
        <tbody>
          {guestList.map((guest) => (
            <tr key={guest.id} className="border-b border-neutral-200 align-top">
              <td className="py-3 pr-3 font-semibold">
                {`${guest.first_name} ${guest.last_name}`.trim()}
              </td>
              <td className="py-3 pr-3">{guest.phone || ""}</td>
              <td className="py-3 pr-3">
                {guest.children.length === 0
                  ? "Ingen registrerte barn"
                  : guest.children.map(childDescription).join("; ")}
              </td>
              <td className="py-3 pr-3">{guest.notes || ""}</td>
              <td className="py-3 pr-3">
                <span className="inline-block h-4 w-4 rounded border border-neutral-400"></span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
