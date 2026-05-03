// Evolution API client (https://doc.evolution-api.com).
// Uses a single global admin API key (EVOLUTION_API_KEY) to manage all
// per-tenant instances. Each tenant has its own `instanceName`.

import { digitsOnly } from "@/lib/phone";

type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
};

function getConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function evoFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const config = getConfig();
  if (!config) {
    throw new Error(
      "Missing Evolution API environment variables (EVOLUTION_API_URL, EVOLUTION_API_KEY)",
    );
  }
  return fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey,
      ...(init.headers ?? {}),
    },
  });
}

export type ConnectionState = "open" | "connecting" | "close" | "unknown";

export type CreateInstanceResult = {
  instanceName: string;
  qrcodeBase64: string | null;
};

/**
 * Creates a new instance and returns the initial QR code (base64 data URL).
 * If the instance already exists, callers should fall back to {@link connectInstance}.
 */
export async function createInstance(
  instanceName: string,
  webhookUrl: string,
): Promise<CreateInstanceResult> {
  const res = await evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Evolution createInstance failed (status=${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const body = (await res.json()) as {
    qrcode?: { base64?: string; code?: string };
  };

  return {
    instanceName,
    qrcodeBase64: body.qrcode?.base64 ?? null,
  };
}

/**
 * Triggers (re)connection of an existing instance and returns a fresh QR code.
 */
export async function connectInstance(
  instanceName: string,
): Promise<{ qrcodeBase64: string | null }> {
  const res = await evoFetch(
    `/instance/connect/${encodeURIComponent(instanceName)}`,
    { method: "GET" },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Evolution connectInstance failed (status=${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const body = (await res.json()) as { base64?: string; code?: string };
  return { qrcodeBase64: body.base64 ?? null };
}

export type InstanceStatus = {
  state: ConnectionState;
  phoneNumber: string | null;
};

/**
 * Returns the current connection state of an instance.
 * Returns state "unknown" if the instance does not exist.
 */
export async function getInstanceStatus(
  instanceName: string,
): Promise<InstanceStatus> {
  const res = await evoFetch(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { method: "GET" },
  );

  if (res.status === 404) {
    return { state: "unknown", phoneNumber: null };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Evolution getInstanceStatus failed (status=${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const body = (await res.json()) as {
    instance?: { state?: ConnectionState; ownerJid?: string | null };
  };
  const state = body.instance?.state ?? "unknown";
  // ownerJid: "5511999999999@s.whatsapp.net" -> "+5511999999999"
  const ownerJid = body.instance?.ownerJid ?? null;
  const phoneNumber = ownerJid ? `+${ownerJid.split("@")[0]}` : null;
  return { state, phoneNumber };
}

/**
 * Logs out and deletes the instance. Idempotent — 404 is treated as success.
 */
export async function deleteInstance(instanceName: string): Promise<void> {
  // Logout first (best-effort), then delete the instance entry.
  await evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  }).catch(() => undefined);

  const res = await evoFetch(
    `/instance/delete/${encodeURIComponent(instanceName)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Evolution deleteInstance failed (status=${res.status}): ${detail.slice(0, 300)}`,
    );
  }
}

/**
 * Sends a plain text message via the given instance.
 * Returns true on success; logs and returns false on failure.
 */
export async function sendText(
  instanceName: string,
  phone: string,
  message: string,
): Promise<boolean> {
  try {
    const res = await evoFetch(
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          number: digitsOnly(phone),
          text: message,
        }),
      },
    );

    if (res.ok) return true;

    const detail = await res.text().catch(() => "");
    console.error(
      `Evolution sendText failed (instance=${instanceName}, status=${res.status}): ${detail.slice(0, 300)}`,
    );
    return false;
  } catch (error) {
    console.error(
      `Error sending WhatsApp message via Evolution (instance=${instanceName}):`,
      error,
    );
    return false;
  }
}
