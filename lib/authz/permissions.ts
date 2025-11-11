// lib/authz/permissions.ts
export type ModuleKey = 'dashboard' | 'members' | 'activities' | 'calendar' | 'stats';
export type Level = 'none' | 'view' | 'edit' | 'admin';

export type UserPermissions = {
  userKey: string;                 // auth.user.id eller e-post
  modules: Partial<Record<ModuleKey, Level>>;
  programs: Record<string, Level>; // programId -> level (Tilbud = program; Event kan knyttes til et program senere)
};

const LS_KEY = 'follies.perms.v1';
const order: Record<Level, number> = { none: 0, view: 1, edit: 2, admin: 3 };

export function levelGte(a: Level | undefined, b: Level) {
  return (order[a ?? 'none'] >= order[b]);
}

export function loadAll(): UserPermissions[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
export function saveAll(rows: UserPermissions[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

export function getFor(userKey?: string): UserPermissions | undefined {
  if (!userKey) return;
  return loadAll().find(r => r.userKey === userKey);
}
export function upsert(row: UserPermissions) {
  const all = loadAll();
  const i = all.findIndex(r => r.userKey === row.userKey);
  if (i >= 0) all[i] = row; else all.unshift(row);
  saveAll(all);
}
export function removeUser(userKey: string) {
  saveAll(loadAll().filter(r => r.userKey !== userKey));
}
