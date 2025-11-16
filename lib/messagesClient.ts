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

type StoredMessage = PortalMessage;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readMessages(): StoredMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "object" && item !== null);
    }
    return [];
  } catch {
    return [];
  }
}

function writeMessages(messages: StoredMessage[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* ignore */
  }
}

function createId() {
  const globalCrypto = typeof crypto !== "undefined" ? crypto : null;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listMessagesForActivity(activityId: string) {
  if (!activityId) return [] as PortalMessage[];
  return readMessages().filter(
    (msg) => msg.scope === "activity" && msg.activityId === activityId
  );
}

export function listMessagesForMember(memberId: string) {
  if (!memberId) return [] as PortalMessage[];
  return readMessages().filter(
    (msg) => msg.scope === "member" && msg.memberId === memberId
  );
}

export function saveMessage(
  msg: Omit<PortalMessage, "id" | "createdAt">
): PortalMessage {
  const stored = readMessages();
  const newMsg: PortalMessage = {
    ...msg,
    id: createId(),
    createdAt: new Date().toISOString(),
  };
  const updated = [newMsg, ...stored];
  writeMessages(updated);
  return newMsg;
}
