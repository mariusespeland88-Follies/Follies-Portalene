import dynamic from "next/dynamic";

// Laster kalenderen som ren klientkomponent (CSR), via aliaset "@"
const PersonalCalendar = dynamic(
  () => import("@/components/calendar/PersonalCalendar"),
  { ssr: false }
);

export default function Page() {
  // Full-bleed wrapper: bryter ut av global max-w container for denne siden
  return (
    <div className="mx-[calc(50%-50vw)] w-screen">
      <PersonalCalendar />
    </div>
  );
}
