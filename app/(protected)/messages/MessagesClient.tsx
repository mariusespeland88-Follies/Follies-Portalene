"use client";

/**
 * PATH: app/(protected)/messages/MessagesClient.tsx
 * Ny Follies Messenger (portal)
 * - Bruker NY struktur: conversations / participants / messages / attachments
 * - DM opprettes via server-route (service role) for å sikre participants
 * - Grupper kan opprettes av medlemmer og ledere
 * - Attachments er private (signed URLs via server routes)
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/browser";
import usePermissions from "@/lib/authz/usePermissions";

type AnyObj = Record<string, any>;

type ConversationType = "dm" | "group" | "activity";

type Conversation = {
  id: string;
  type: ConversationType;
  title: string | null;
  activity_id: string | null;
  created_at: string;
};

type Participant = {
  conversation_id: string;
  member_id: string;
  last_read_at: string | null;
  role: string | null;
};

type MemberLite = {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_member_id: string;
  body: string | null;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
};

type ConversationAttachmentRow = AttachmentRow & {
  sender_member_id: string | null;
  message_created_at: string | null;
};

function safeName(first?: string | null, last?: string | null) {
  const fn = String(first ?? "").trim();
  const ln = String(last ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || "Ukjent";
}
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p?.[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("nb-NO");
  } catch {
    return "—";
  }
}
function clampPreview(s: string, n = 52) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/** ------------------------------------------------------------ */

export default function MessagesClient() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();

  const { loading: permsLoading, meMemberId } = usePermissions();

  // URL: /messages?memberId=...  -> ønsket DM
  const openMemberId = sp.get("memberId");

  const [booting, setBooting] = React.useState(true);
  const [reloadTick, setReloadTick] = React.useState(0);

  const [me, setMe] = React.useState<{ id: string | null }>({ id: null });

  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [membersById, setMembersById] = React.useState<Record<string, MemberLite>>(
    {}
  );

  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(
    null
  );

  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = React.useState<
    Record<string, AttachmentRow[]>
  >({});
  const [conversationAttachments, setConversationAttachments] = React.useState<
    ConversationAttachmentRow[]
  >([]);
  const [activeParticipants, setActiveParticipants] = React.useState<Participant[]>([]);
  const [onlineIds, setOnlineIds] = React.useState<Set<string>>(new Set());
  const [listQuery, setListQuery] = React.useState("");

  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Emoji mini-palette (enkelt, men funker)
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const EMOJIS = ["😊", "😂", "❤️", "🔥", "🙌", "🥺", "👍", "🎭", "✅", "😮"];

  // Upload state
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const imgRef = React.useRef<HTMLInputElement | null>(null);

  // Realtime subscription
  const channelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);

  /** --------------------- bootstrap: finn meg --------------------- */
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // prefer fra usePermissions (LS/DB)
        const id = (meMemberId ?? "").trim() || null;
        if (alive) setMe({ id });
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [meMemberId]);

  /** ------------------- last inn conversations for meg ------------------- */
  React.useEffect(() => {
    if (booting) return;
    if (!me.id) return;

    let alive = true;

    (async () => {
      setError(null);
      try {
        // Sikrer at aktivitetsrom finnes og har riktig deltakerliste
        await fetch("/api/messenger/activity/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => null);

        // 1) mine participant-rader
        const { data: pRows, error: pErr } = await supabase
          .from("conversation_participants")
          .select("conversation_id, member_id, last_read_at, role")
          .eq("member_id", me.id);

        if (!alive) return;
        if (pErr) throw pErr;

        const parts = (pRows || []) as any[];
        setParticipants(
          parts.map((r) => ({
            conversation_id: String(r.conversation_id),
            member_id: String(r.member_id),
            last_read_at: r.last_read_at ?? null,
            role: r.role ?? null,
          }))
        );

        const convIds = Array.from(new Set(parts.map((r) => String(r.conversation_id))));
        if (convIds.length === 0) {
          setConversations([]);
          return;
        }

        // 2) conversations
        const { data: cRows, error: cErr } = await supabase
          .from("conversations")
          .select("id, type, title, activity_id, created_at")
          .in("id", convIds);

        if (!alive) return;
        if (cErr) throw cErr;

        const convs = (cRows || []) as any[];
        const normalized: Conversation[] = convs.map((c) => ({
          id: String(c.id),
          type: String(c.type) as ConversationType,
          title: c.title ?? null,
          activity_id: c.activity_id ?? null,
          created_at: c.created_at ?? new Date().toISOString(),
        }));
        setConversations(normalized);

        // 3) hent participants for disse convs (for å vite hvem som er i DM)
        // (RLS tillater select participants for convs du er i)
        const { data: allP, error: allPErr } = await supabase
          .from("conversation_participants")
          .select("conversation_id, member_id, last_read_at, role")
          .in("conversation_id", convIds);

        if (!alive) return;
        if (allPErr) throw allPErr;

        const allParts = (allP || []) as any[];

        // 4) hent member-info for alle member_id vi ser
        const memberIds = Array.from(
          new Set(allParts.map((x) => String(x.member_id)))
        ).filter(Boolean);

        if (memberIds.length) {
          const { data: mRows } = await supabase
            .from("members")
            .select("id, first_name, last_name, email, avatar_url")
            .in("id", memberIds);

          if (!alive) return;

          const map: Record<string, MemberLite> = {};
          for (const row of (mRows || []) as any[]) {
            const id = String(row.id);
            map[id] = {
              id,
              name: safeName(row.first_name, row.last_name),
              email: row.email ?? null,
              avatar_url: row.avatar_url ?? null,
            };
          }
          setMembersById(map);
        }

        // 5) hvis URL ber om DM med memberId -> ensure DM via API
        if (openMemberId) {
          const dmId = await ensureDmConversation(openMemberId);
          if (dmId) {
            setActiveConversationId(dmId);
            // rydd URL (så refresh ikke re-trigger)
            router.replace("/messages");
            return;
          }
        }

        // 6) hvis ingen aktiv conversation valgt, velg første
        if (!activeConversationId && normalized.length) {
          setActiveConversationId(normalized[0].id);
        }
      } catch (e: any) {
        console.error(e);
        if (alive) setError(e?.message || "Kunne ikke laste Messenger.");
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, me.id, reloadTick]);

  /** ------------------- last inn messages for aktiv conversation ------------------- */
  React.useEffect(() => {
    if (!me.id) return;
    if (!activeConversationId) return;

    let alive = true;

    (async () => {
      setError(null);
      try {
        // unsubscribe forrige
        if (channelRef.current) {
          try {
            await supabase.removeChannel(channelRef.current);
          } catch {}
          channelRef.current = null;
        }

        const refreshActiveParticipants = async () => {
          const { data: pRows, error: pErr } = await supabase
            .from("conversation_participants")
            .select("conversation_id, member_id, last_read_at, role")
            .eq("conversation_id", activeConversationId);
          if (pErr) throw pErr;
          const rows = (pRows || []) as any[];
          setActiveParticipants(
            rows.map((r) => ({
              conversation_id: String(r.conversation_id),
              member_id: String(r.member_id),
              last_read_at: r.last_read_at ? String(r.last_read_at) : null,
              role: r.role ?? null,
            }))
          );
        };

        // 1) messages
        const { data: rows, error: err } = await supabase
          .from("conversation_messages")
          .select("id, conversation_id, sender_member_id, body, created_at")
          .eq("conversation_id", activeConversationId)
          .order("created_at", { ascending: true })
          .limit(400);

        if (!alive) return;
        if (err) throw err;

        const msgs = (rows || []) as any[];
        const normalized: MessageRow[] = msgs.map((m) => ({
          id: String(m.id),
          conversation_id: String(m.conversation_id),
          sender_member_id: String(m.sender_member_id),
          body: m.body ?? null,
          created_at: m.created_at ?? new Date().toISOString(),
        }));
        setMessages(normalized);

        // 2) attachments for disse messages
        const msgIds = normalized.map((m) => m.id);
        if (msgIds.length) {
          const { data: attRows, error: attErr } = await supabase
            .from("conversation_attachments")
            .select(
              "id, message_id, storage_path, file_name, mime_type, file_size, image_width, image_height, created_at"
            )
            .in("message_id", msgIds);

          if (!alive) return;
          if (attErr) throw attErr;

          const by: Record<string, AttachmentRow[]> = {};
          for (const a of (attRows || []) as any[]) {
            const mid = String(a.message_id);
            if (!by[mid]) by[mid] = [];
            by[mid].push({
              id: String(a.id),
              message_id: mid,
              storage_path: String(a.storage_path),
              file_name: String(a.file_name),
              mime_type: a.mime_type ?? null,
              file_size: a.file_size ?? null,
              image_width: a.image_width ?? null,
              image_height: a.image_height ?? null,
              created_at: a.created_at ?? new Date().toISOString(),
            });
          }
          setAttachmentsByMessageId(by);
        } else {
          setAttachmentsByMessageId({});
        }

        const attListRes = await fetch("/api/messenger/attachments/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeConversationId, limit: 600 }),
        });
        const attListJson = await attListRes.json().catch(() => ({} as AnyObj));
        if (attListRes.ok) {
          const items = Array.isArray(attListJson?.items) ? attListJson.items : [];
          setConversationAttachments(
            items.map((a: AnyObj) => ({
              id: String(a.id || ""),
              message_id: String(a.message_id || ""),
              storage_path: String(a.storage_path || ""),
              file_name: String(a.file_name || ""),
              mime_type: a.mime_type ?? null,
              file_size: typeof a.file_size === "number" ? a.file_size : null,
              image_width: typeof a.image_width === "number" ? a.image_width : null,
              image_height: typeof a.image_height === "number" ? a.image_height : null,
              created_at: String(a.created_at || a.message_created_at || ""),
              sender_member_id: a.sender_member_id ? String(a.sender_member_id) : null,
              message_created_at: a.message_created_at ? String(a.message_created_at) : null,
            }))
          );
        } else {
          setConversationAttachments([]);
        }

        // 2b) participants + read status for aktiv samtale
        await refreshActiveParticipants();

        // 2c) mark as read for current user
        await supabase
          .from("conversation_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", activeConversationId)
          .eq("member_id", me.id);

        // 3) realtime subscribe (kun inserts)
        const ch = supabase
          .channel(`conv:${activeConversationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "conversation_messages",
              filter: `conversation_id=eq.${activeConversationId}`,
            },
            async (payload) => {
              const m = payload.new as any;
              setMessages((prev) => {
                const id = String(m.id);
                if (prev.some((x) => x.id === id)) return prev;
                return [
                  ...prev,
                  {
                    id,
                    conversation_id: String(m.conversation_id),
                    sender_member_id: String(m.sender_member_id),
                    body: m.body ?? null,
                    created_at: m.created_at ?? new Date().toISOString(),
                  },
                ];
              });

              // Mark incoming as read when chat is open
              if (String(m.sender_member_id) !== String(me.id)) {
                await supabase
                  .from("conversation_participants")
                  .update({ last_read_at: new Date().toISOString() })
                  .eq("conversation_id", activeConversationId)
                  .eq("member_id", me.id);
                try {
                  await refreshActiveParticipants();
                } catch {}
              }
            }
          )
          .subscribe();

        channelRef.current = ch;
      } catch (e: any) {
        console.error(e);
        if (alive) setError(e?.message || "Kunne ikke laste meldinger.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeConversationId, me.id, supabase]);

  /** ------------------- helpers: finne title og DM-part ------------------- */
  const convById = React.useMemo(() => {
    const m = new Map<string, Conversation>();
    for (const c of conversations) m.set(c.id, c);
    return m;
  }, [conversations]);

  const activeConv = activeConversationId ? convById.get(activeConversationId) : null;

  // Vi trenger participants for å finne motpart i DM:
  const [allParticipants, setAllParticipants] = React.useState<
    { conversation_id: string; member_id: string; last_read_at: string | null }[]
  >([]);

  React.useEffect(() => {
    if (!me.id) return;
    if (conversations.length === 0) return;

    let alive = true;
    (async () => {
      try {
        const ids = conversations.map((c) => c.id);
        const { data, error } = await supabase
          .from("conversation_participants")
          .select("conversation_id, member_id, last_read_at")
          .in("conversation_id", ids);
        if (!alive) return;
        if (error) throw error;
        setAllParticipants((data || []) as any[]);
      } catch (e) {
        // stille (ikke kritisk)
      }
    })();
    return () => {
      alive = false;
    };
  }, [me.id, conversations, supabase]);

  React.useEffect(() => {
    if (!me.id || !activeConversationId) return;

    const ch = supabase.channel(`presence:${activeConversationId}`, {
      config: { presence: { key: me.id } },
    });

    const syncPresence = () => {
      const state = (ch.presenceState?.() ?? {}) as Record<string, any[]>;
      const ids = new Set<string>();
      for (const [key, values] of Object.entries(state)) {
        if (!Array.isArray(values) || values.length === 0) continue;
        const first = values[0] as any;
        const id = String(first?.member_id ?? key).trim();
        if (id) ids.add(id);
      }
      setOnlineIds(ids);
    };

    ch.on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await ch.track({ member_id: me.id, at: new Date().toISOString() });
          } catch {}
        }
      });

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [activeConversationId, me.id, supabase]);

  function displayTitle(c: Conversation): { title: string; peerId?: string } {
    if (c.type !== "dm") {
      return { title: c.title || (c.type === "activity" ? "Aktivitet" : "Gruppe") };
    }
    const parts = allParticipants.filter((p) => p.conversation_id === c.id);
    const peer = parts.find((p) => p.member_id !== me.id);
    const peerId = peer?.member_id;
    const peerName = peerId ? membersById[peerId]?.name : null;
    return { title: peerName || c.title || "Privat chat", peerId };
  }

  /** ------------------- ensure DM via server route ------------------- */
  async function ensureDmConversation(otherMemberId: string): Promise<string | null> {
    if (!me.id) return null;
    try {
      const res = await fetch("/api/messenger/dm/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meMemberId: me.id, otherMemberId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Kunne ikke opprette DM.");
      const cid = String(json?.conversationId ?? json?.conversation_id ?? "");
      if (!cid) throw new Error("Mangler conversationId");
      setConversations((prev) => {
        if (prev.some((c) => c.id === cid)) return prev;
        return [
          {
            id: cid,
            type: "dm",
            title: null,
            activity_id: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ];
      });
      return cid;
    } catch (e: any) {
      setError(e?.message || "Kunne ikke opprette DM.");
      return null;
    }
  }

  async function notifyMessagePush(messageId: string) {
    if (!activeConversationId) return;
    try {
      await fetch("/api/messenger/messages/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          messageId,
        }),
      });
    } catch {
      // Push er best effort.
    }
  }

  /** ------------------- send message ------------------- */
  async function sendText() {
    if (!me.id || !activeConversationId) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    try {
      const { data: inserted, error } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: activeConversationId,
          sender_member_id: me.id,
          body: text,
        })
        .select("id")
        .single();
      if (error) throw error;
      setDraft("");
      setEmojiOpen(false);
      const messageId = String((inserted as AnyObj)?.id ?? "").trim();
      if (messageId) void notifyMessagePush(messageId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Kunne ikke sende melding.");
    } finally {
      setSending(false);
    }
  }

  /** ------------------- attachments (private) ------------------- */
  async function uploadAttachment(file: File) {
    if (!me.id || !activeConversationId) return;

    setSending(true);
    setError(null);

    try {
      // 1) lag en melding først (tom tekst ok)
      const { data: msgRow, error: msgErr } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: activeConversationId,
          sender_member_id: me.id,
          body: null,
        })
        .select("id")
        .single();

      if (msgErr) throw msgErr;

      const messageId = String((msgRow as any)?.id || "");
      if (!messageId) throw new Error("Kunne ikke opprette meldings-ID.");

      // 2) be server om signed upload url + path
      const res = await fetch("/api/messenger/attachments/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          messageId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Kunne ikke lage upload-url.");

      const { uploadUrl, storagePath } = j as {
        uploadUrl: string;
        storagePath: string;
      };
      if (!uploadUrl || !storagePath) throw new Error("Mangler upload-data.");

      // 3) last opp filen direkte til signed url
      const up = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!up.ok) throw new Error("Opplasting feilet.");

      // 4) registrer attachment i DB (RLS: select er sikret, insert via service route)
      const res2 = await fetch("/api/messenger/attachments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const j2 = await res2.json().catch(() => ({}));
      if (!res2.ok) throw new Error(j2?.error || "Kunne ikke registrere vedlegg.");

      void notifyMessagePush(messageId);

      // 5) refresh attachments
      setTimeout(() => {
        setReloadTick((x) => x + 1);
      }, 50);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Kunne ikke laste opp vedlegg.");
    } finally {
      setSending(false);
    }
  }

  function onPickFile(kind: "file" | "image") {
    if (kind === "file") fileRef.current?.click();
    else imgRef.current?.click();
  }

  /** ------------------- group create ------------------- */
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [groupTitle, setGroupTitle] = React.useState("");
  const [groupPick, setGroupPick] = React.useState<Record<string, boolean>>({});
  const [groupQuery, setGroupQuery] = React.useState("");
  const [groupSearchRows, setGroupSearchRows] = React.useState<MemberLite[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = React.useState(false);

  const memberList = React.useMemo(() => Object.values(membersById), [membersById]);
  React.useEffect(() => {
    if (!groupOpen) return;
    const q = groupQuery.trim();
    if (!q) {
      setGroupSearchRows([]);
      return;
    }

    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/messenger/members/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, limit: 60 }),
        });
        const json = await res.json().catch(() => ({} as AnyObj));
        if (!alive || !res.ok) {
          if (alive) setGroupSearchRows([]);
          return;
        }
        const items = Array.isArray(json?.items) ? json.items : [];
        setGroupSearchRows(
          items.map((m: AnyObj) => ({
            id: String(m.id || ""),
            name: String(m.name || "Ukjent"),
            email: m.email ?? null,
            avatar_url: m.avatar_url ?? null,
          }))
        );
      } catch {
        if (alive) setGroupSearchRows([]);
      }
    }, 220);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [groupOpen, groupQuery]);

  const filteredMembers = React.useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    const local = memberList.filter((m) => m.id !== me.id);
    if (!q) return local.sort((a, b) => a.name.localeCompare(b.name, "nb"));
    const remote = groupSearchRows.filter((m) => m.id !== me.id);
    if (remote.length > 0) return remote.sort((a, b) => a.name.localeCompare(b.name, "nb"));
    return local
      .filter((m) => m.name.toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "nb"));
  }, [memberList, groupQuery, groupSearchRows, me.id]);

  async function createGroup() {
    if (!me.id) return;
    const title = groupTitle.trim();
    const ids = Object.entries(groupPick)
      .filter(([, v]) => v)
      .map(([id]) => id);

    if (!title) {
      setError("Gruppen må ha et navn.");
      return;
    }
    if (ids.length === 0) {
      setError("Velg minst én deltaker.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/messenger/group/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meMemberId: me.id, title, memberIds: ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Kunne ikke opprette gruppe.");
      const cid = String(json?.conversationId ?? json?.conversation_id ?? "");
      if (!cid) throw new Error("Mangler conversationId.");
      setGroupOpen(false);
      setGroupTitle("");
      setGroupPick({});
      setActiveConversationId(cid);

      setReloadTick((x) => x + 1);
    } catch (e: any) {
      setError(e?.message || "Kunne ikke opprette gruppe.");
    } finally {
      setSending(false);
    }
  }

  /** ------------------- UI: conversation list with last message preview ------------------- */
  const lastByConv = React.useMemo(() => {
    const map: Record<string, { text: string; at: string }> = {};
    for (const m of messages) {
      // messages er for aktiv conv, ikke alle – så vi lager et fallback basert på conv.updated_at
      void m;
    }
    return map;
  }, [messages]);

  const sortedConversations = React.useMemo(() => {
    // enkel sort: newest created_at først (senere kan vi sortere på siste melding)
    return [...conversations].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [conversations]);
  const filteredConversations = React.useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return sortedConversations;
    return sortedConversations.filter((c) => {
      const title = displayTitle(c).title.toLowerCase();
      if (title.includes(q)) return true;
      if (c.type === "activity" && "aktivitet aktivitetsrom".includes(q)) return true;
      if (c.type === "group" && "gruppe".includes(q)) return true;
      if (c.type === "dm" && "privat".includes(q)) return true;
      return false;
    });
  }, [listQuery, sortedConversations, allParticipants, membersById, me.id]);

  const activeInfo = React.useMemo(
    () => (activeConv ? displayTitle(activeConv) : null),
    [activeConv, allParticipants, membersById, me.id]
  );
  const activePeerId = activeInfo?.peerId ?? null;
  const activePeerParticipant = activePeerId
    ? activeParticipants.find((p) => p.member_id === activePeerId) || null
    : null;
  const activePeerOnline = activePeerId ? onlineIds.has(activePeerId) : false;
  const activeAttachmentList = React.useMemo(() => {
    if (conversationAttachments.length) return conversationAttachments;
    const flat: ConversationAttachmentRow[] = [];
    for (const m of messages) {
      const atts = attachmentsByMessageId[m.id] || [];
      for (const a of atts) {
        flat.push({
          ...a,
          sender_member_id: m.sender_member_id,
          message_created_at: m.created_at,
        });
      }
    }
    return flat.sort(
      (a, b) =>
        new Date(b.message_created_at || b.created_at).getTime() -
        new Date(a.message_created_at || a.created_at).getTime()
    );
  }, [conversationAttachments, messages, attachmentsByMessageId]);

  /** ------------------- render ------------------- */
  if (booting || permsLoading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 text-neutral-900">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm font-medium shadow">
          Laster Messenger…
        </div>
      </main>
    );
  }

  if (!me.id) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 text-neutral-900">
        <div className="rounded-2xl border border-red-200 bg-rose-50 p-6 text-sm text-red-800 shadow">
          Fant ikke innlogget medlem (memberId). Logg inn på nytt, eller åpne Dashboard og refresh.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-neutral-900">
      {/* header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-red-600">Follies Messenger</h1>
          <p className="mt-1 text-sm text-neutral-700">Privat chat, grupper og aktivitetsrom – kun det du har tilgang til.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setGroupOpen(true)}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-red-600"
          >
            + Ny gruppe
          </button>

          <Link
            href="/members"
            className="rounded-lg border border-red-500 bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50"
          >
            Medlemmer
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-rose-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-neutral-200 bg-white shadow">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.6fr)]">
          {/* LEFT: conversation list */}
          <aside className="border-b border-neutral-200 bg-neutral-50 lg:border-b-0 lg:border-r">
            <div className="border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Samtaler</div>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-red-200">
                  {filteredConversations.length}
                </span>
              </div>
              <div className="mt-2 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm">
                <input
                  placeholder="Søk samtaler"
                  className="w-full bg-transparent outline-none placeholder:text-neutral-400"
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-sm text-neutral-700">
                  Ingen samtaler ennå. Gå til et medlem og trykk <span className="font-semibold">Messenger</span>.
                </div>
              ) : (
                <ul className="divide-y divide-neutral-200">
                  {filteredConversations.map((c) => {
                    const active = c.id === activeConversationId;
                    const info = displayTitle(c);
                    const peer = info.peerId ? membersById[info.peerId] : null;

                    const avatarUrl = peer?.avatar_url || null;
                    const title = info.title;

                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => setActiveConversationId(c.id)}
                          className={
                            "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition " +
                            (active ? "bg-red-50" : "hover:bg-white")
                          }
                        >
                          {/* avatar */}
                          {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatarUrl}
                              alt={title}
                              className="h-11 w-11 rounded-full border border-neutral-200 object-cover"
                            />
                          ) : (
                            <div className="grid h-11 w-11 place-items-center rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700">
                              {initials(title)}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate font-semibold text-neutral-900">{title}</div>
                              <div className="text-[11px] font-medium text-neutral-500">
                                {fmtTime(c.created_at)}
                              </div>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-neutral-600">
                              {c.type === "activity" ? "Aktivitetsrom" : c.type === "group" ? "Gruppe" : "Privat"}
                              {" · "}
                              {clampPreview(lastByConv[c.id]?.text || "")}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* RIGHT: chat */}
          <section className="flex min-h-[520px] flex-col bg-neutral-50">
            {/* chat header */}
            <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-neutral-900">
                  {activeInfo ? activeInfo.title : "Velg en samtale"}
                </div>
                <div className="text-xs text-neutral-600">
                  {!activeConv
                    ? "—"
                    : activeConv.type === "dm"
                    ? activePeerOnline
                      ? "Privat · Pålogget nå"
                      : activePeerParticipant?.last_read_at
                      ? `Privat · sist lest ${fmtDateTime(activePeerParticipant.last_read_at)}`
                      : "Privat · Frakoblet"
                    : activeConv.type === "group"
                    ? "Gruppe"
                    : "Aktivitet"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeConversationId ? (
                  <button
                    onClick={() => setAttachmentsOpen(true)}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100"
                  >
                    Vedlegg ({activeAttachmentList.length})
                  </button>
                ) : null}
                {activeConv?.type === "dm" && activePeerId ? (
                  <Link
                    href={`/members/${encodeURIComponent(activePeerId)}`}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100"
                  >
                    Åpne medlem
                  </Link>
                ) : null}
              </div>
            </div>

            {/* messages */}
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {!activeConversationId ? (
                <div className="text-sm text-neutral-700">Velg en samtale til venstre.</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-neutral-700">Ingen meldinger ennå. Skriv den første 👇</div>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_member_id === me.id;
                  const sender = membersById[m.sender_member_id];
                  const senderName = sender?.name || "Ukjent";
                  const atts = attachmentsByMessageId[m.id] || [];
                  const seenByCount = mine
                    ? activeParticipants.filter((p) => {
                        if (p.member_id === me.id) return false;
                        const readAt = p.last_read_at ? Date.parse(p.last_read_at) : 0;
                        const sentAt = Date.parse(m.created_at) || 0;
                        return readAt > 0 && sentAt > 0 && readAt >= sentAt;
                      }).length
                    : 0;

                  return (
                    <div key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
                      <div className={"max-w-[78%] space-y-1"}>
                        {!mine ? (
                          <div className="text-[11px] font-semibold text-neutral-600">{senderName}</div>
                        ) : null}

                        {/* attachments */}
                        {atts.length ? (
                          <div className="space-y-2">
                            {atts.map((a) => (
                              <AttachmentCard key={a.id} a={a} />
                            ))}
                          </div>
                        ) : null}

                        {/* text bubble */}
                        {m.body ? (
                          <div
                            className={
                              "rounded-2xl border px-3 py-1.5 text-[13px] leading-relaxed " +
                              (mine
                                ? "border-neutral-200 bg-white"
                                : "border-neutral-200 bg-white")
                            }
                          >
                            {m.body}
                          </div>
                        ) : null}

                        <div className={"text-[10px] text-neutral-500 " + (mine ? "text-right" : "text-left")}>
                          {new Date(m.created_at).toLocaleString("nb-NO")}
                          {mine ? ` · ${seenByCount > 0 ? "Sett" : "Sendt"}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* composer */}
            <div className="border-t border-neutral-200 bg-white px-4 py-3">
              {/* hidden file inputs */}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadAttachment(f);
                }}
              />
              <input
                ref={imgRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadAttachment(f);
                }}
              />

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-lg hover:bg-neutral-200"
                  title="Emoji"
                >
                  😊
                </button>

                <button
                  type="button"
                  onClick={() => onPickFile("file")}
                  className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-sm hover:bg-neutral-200"
                  title="Fil"
                >
                  📎
                </button>

                <button
                  type="button"
                  onClick={() => onPickFile("image")}
                  className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-sm hover:bg-neutral-200"
                  title="Bilde"
                >
                  🖼️
                </button>

                <div className="flex-1 rounded-full bg-neutral-100 px-4 py-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Aa"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendText();
                      }
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={sendText}
                  disabled={sending || !draft.trim() || !activeConversationId}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  Send
                </button>
              </div>

              {emojiOpen ? (
                <div className="mt-2 flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-2">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-xl bg-white text-lg hover:bg-neutral-100"
                      onClick={() => setDraft((d) => d + e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 text-[11px] text-neutral-500">
                Realtime på meldinger er aktiv. Vedlegg er private (signed URLs).
              </div>
            </div>
          </section>
        </div>
      </section>

      {/* Group modal */}
      {groupOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGroupOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-neutral-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Ny gruppe</div>
                <div className="text-xs text-neutral-600">Medlemmer og ledere kan opprette grupper.</div>
              </div>
              <button
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100"
                onClick={() => setGroupOpen(false)}
              >
                Lukk
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr,1.2fr]">
              <div>
                <label className="text-xs font-semibold text-neutral-700">Gruppenavn</label>
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="F.eks. Refleksjoner – crew"
                />

                <label className="mt-4 block text-xs font-semibold text-neutral-700">Søk medlemmer</label>
                <input
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="Søk navn eller e-post…"
                />

                <button
                  onClick={createGroup}
                  disabled={sending}
                  className="mt-4 w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {sending ? "Oppretter…" : "Opprett gruppe"}
                </button>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-xs font-semibold text-neutral-700">Velg deltakere</div>
                <div className="mt-2 max-h-[320px] overflow-y-auto divide-y divide-neutral-200 rounded-xl bg-white">
                  {filteredMembers.map((m) => {
                    const checked = !!groupPick[m.id];
                    return (
                      <label key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setGroupPick((prev) => ({ ...prev, [m.id]: e.target.checked }))
                          }
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-neutral-900">{m.name}</div>
                          <div className="truncate text-xs text-neutral-600">{m.email || "—"}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] text-neutral-600">
                  Valgt:{" "}
                  <span className="font-semibold">
                    {Object.values(groupPick).filter(Boolean).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {attachmentsOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAttachmentsOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-neutral-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Alle vedlegg</div>
                <div className="text-xs text-neutral-600">
                  {activeAttachmentList.length} filer i denne samtalen
                </div>
              </div>
              <button
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100"
                onClick={() => setAttachmentsOpen(false)}
              >
                Lukk
              </button>
            </div>

            <div className="mt-4 max-h-[70vh] overflow-y-auto rounded-2xl border border-neutral-200">
              {activeAttachmentList.length === 0 ? (
                <div className="p-4 text-sm text-neutral-700">Ingen vedlegg i samtalen ennå.</div>
              ) : (
                <ul className="divide-y divide-neutral-200">
                  {activeAttachmentList.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-neutral-900">{a.file_name}</div>
                        <div className="truncate text-xs text-neutral-600">
                          {a.mime_type || "fil"}
                          {a.file_size ? ` · ${Math.round(a.file_size / 1024)} KB` : ""}
                          {" · "}
                          {fmtDateTime(a.message_created_at || a.created_at)}
                        </div>
                      </div>
                      <AttachmentOpenButton storagePath={a.storage_path} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function AttachmentOpenButton({ storagePath }: { storagePath: string }) {
  const [busy, setBusy] = React.useState(false);

  return (
    <button
      className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/messenger/attachments/download-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storagePath }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j?.error || "Kunne ikke hente lenke.");
          const u = String(j?.signedUrl || "");
          if (!u) throw new Error("Mangler signedUrl.");
          window.open(u, "_blank");
        } catch (e) {
          console.error(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "…" : "Åpne"}
    </button>
  );
}

/** ------------------- Attachment card (portal) ------------------- */
function AttachmentCard({ a }: { a: AttachmentRow }) {
  const [busy, setBusy] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const isImage = (a.mime_type || "").startsWith("image/");

  async function ensureUrl() {
    if (url) return url;
    setBusy(true);
    try {
      const res = await fetch("/api/messenger/attachments/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: a.storage_path }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Kunne ikke hente lenke.");
      const u = String(j?.signedUrl || "");
      if (!u) throw new Error("Mangler signedUrl.");
      setUrl(u);
      return u;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-900">
            {a.file_name}
          </div>
          <div className="text-xs text-neutral-600">
            {a.mime_type || "fil"} {a.file_size ? `· ${Math.round(a.file_size / 1024)} KB` : ""}
          </div>
        </div>

        <button
          className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            const u = await ensureUrl();
            if (u) window.open(u, "_blank");
          }}
        >
          {busy ? "…" : "Åpne"}
        </button>
      </div>

      {isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={a.file_name} className="mt-2 w-full rounded-xl border border-neutral-200 object-cover" />
      ) : null}
    </div>
  );
}
