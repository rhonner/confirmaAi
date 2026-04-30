// WAHA (WhatsApp HTTP API) integration.
// Docs: https://waha.devlike.pro
// Send endpoint: POST {WAHA_API_URL}/api/sendText
// Headers: X-Api-Key: {WAHA_API_KEY}
// Body: { session, chatId, text }

import { digitsOnly } from "@/lib/phone";

/** Convert canonical "+5511999999999" -> "5511999999999@c.us" (WAHA chat id). */
export function phoneToChatId(phone: string): string {
  return `${digitsOnly(phone)}@c.us`;
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
): Promise<boolean> {
  const apiUrl = process.env.WAHA_API_URL;
  const apiKey = process.env.WAHA_API_KEY;
  const session = process.env.WAHA_SESSION || "default";

  if (!apiUrl || !apiKey) {
    console.error("Missing WAHA environment variables (WAHA_API_URL, WAHA_API_KEY)");
    return false;
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        session,
        chatId: phoneToChatId(phone),
        text: message,
      }),
    });

    if (response.ok) return true;

    const detail = await response.text().catch(() => "");
    console.error(
      `WAHA sendText failed (status=${response.status}): ${detail.slice(0, 300)}`,
    );
    return false;
  } catch (error) {
    console.error("Error sending WhatsApp message via WAHA:", error);
    return false;
  }
}
