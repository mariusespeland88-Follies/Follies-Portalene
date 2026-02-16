export type ExpoPushPayload = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: string;
  sound?: "default";
  priority?: "default" | "normal" | "high";
};

export type ExpoPushResult = {
  sent: number;
  failed: number;
  deadTokens: string[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function isExpoPushToken(value: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(
    String(value ?? "").trim()
  );
}

export async function sendExpoPush(payloads: ExpoPushPayload[]): Promise<ExpoPushResult> {
  const safePayloads = payloads
    .map((p) => ({
      ...p,
      to: String(p.to ?? "").trim(),
      sound: p.sound ?? "default",
      channelId: p.channelId ?? "messages",
      priority: p.priority ?? "high",
    }))
    .filter((p) => isExpoPushToken(p.to));

  if (!safePayloads.length) return { sent: 0, failed: 0, deadTokens: [] };

  let sent = 0;
  let failed = 0;
  const deadTokens = new Set<string>();

  for (const group of chunk(safePayloads, 100)) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(group),
    });

    if (!res.ok) {
      failed += group.length;
      continue;
    }

    const json = await res.json().catch(() => ({} as any));
    const rows = Array.isArray(json?.data) ? json.data : [];

    for (let i = 0; i < group.length; i++) {
      const row = rows[i] as any;
      const token = group[i].to;
      if (row?.status === "ok") {
        sent += 1;
      } else {
        failed += 1;
        if (String(row?.details?.error ?? "") === "DeviceNotRegistered") {
          deadTokens.add(token);
        }
      }
    }
  }

  return { sent, failed, deadTokens: uniq(Array.from(deadTokens)) };
}
