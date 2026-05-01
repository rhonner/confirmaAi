// WhatsApp send wrapper. Each tenant (User) has its own Evolution instance,
// so callers must pass the user's instance name. Returns true on success.

import { sendText } from "./evolution";

export async function sendWhatsAppMessage(
  instanceName: string | null | undefined,
  phone: string,
  message: string,
): Promise<boolean> {
  if (!instanceName) {
    console.error(
      "sendWhatsAppMessage: user has no Evolution instance configured",
    );
    return false;
  }
  return sendText(instanceName, phone, message);
}
