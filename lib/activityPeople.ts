// Legacy-klienthjelper (IKKE server actions). Server-funksjoner flyttet til lib/server/activityPeople.ts
export type AnyObj = Record<string, any>;

export function splitLocalPeopleFromActivity(activity: AnyObj | null) {
  // Forenklingsantakelser for gammel LS-struktur:
  const p: string[] = Array.isArray(activity?.participants) ? activity!.participants : [];
  const l: string[] = Array.isArray(activity?.leaders) ? activity!.leaders : [];

  const leaderSet = new Set(l);
  const participantsOnly = p.filter((id) => !leaderSet.has(id));
  return { participantIds: participantsOnly, leaderIds: l };
}
