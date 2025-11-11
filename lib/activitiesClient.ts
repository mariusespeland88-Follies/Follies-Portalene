// lib/activitiesClient.ts
"use client";

// Midlertidig “safe” implementasjon som kan byttes ut.
// Returnerer et enkelt objekt og lar appen leve.
// Bytt til din faktiske lagring senere.

export type ActivityLike = {
  id?: string;
  name?: string;
  type?: string;
  archived?: boolean;
  [k: string]: any;
};

export async function saveActivity(a: ActivityLike): Promise<ActivityLike> {
  try {
    // Hvis du har en API-rute /api/activities, kan du poste dit her.
    // Dette er en no-op som bare speiler input i mellomtiden.
    return Promise.resolve({ ...a, id: a.id ?? crypto.randomUUID() });
  } catch {
    return { ...a, id: a.id ?? crypto.randomUUID() };
  }
}
