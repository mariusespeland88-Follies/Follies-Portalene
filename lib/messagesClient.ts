"use client";

export type MessageScope = "activity" | "member";

export type MessageTarget =
  | "all"
  | "participants"
  | "leaders"
  | "guests"
  | "volunteers"
  | "custom";

export type PortalMessage = {
  id: string;
  scope: MessageScope;
  activityId?: string | null;
  memberId?: string | null;
  target: MessageTarget;
  subject: string;
  body: string;
  createdAt: string;
  createdByEmail?: string | null;
  createdByName?: string | null;
};

const STORAGE_KEY = "follies.messages.v1";

type MessageStore = {
  messages: PortalMessage[];
};

const memoryStore: MessageStore = { messages: [] };

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStore(): MessageStore {
  const storage = getStorage();
  if (!storage) {
    return memoryStore;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [] };
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.messages)) {
      return { messages: parsed.messages as PortalMessage[] };
    }
  } catch {
    /* ignore */
  }
  return { messages: [] };
}

function writeStore(store: MessageStore) {
  const storage = getStorage();
  if (!storage) {
    memoryStore.messages = store.messages;
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listMessagesForActivity(activityId: string): PortalMessage[] {
  if (!activityId) return [];
  const store = readStore();
  return store.messages.filter(
    (m) => m.scope === "activity" && m.activityId === activityId
  );
}

export function listMessagesForMember(memberId: string): PortalMessage[] {
  if (!memberId) return [];
  const store = readStore();
  return store.messages.filter(
    (m) => m.scope === "member" && m.memberId === memberId
  );
}

export function saveMessage(
  msg: Omit<PortalMessage, "id" | "createdAt">
): PortalMessage {
  const store = readStore();
  const message: PortalMessage = {
    ...msg,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  store.messages = [message, ...store.messages];
  writeStore(store);
  return message;
}
