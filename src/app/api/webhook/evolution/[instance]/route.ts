import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseResponse } from "@/lib/services/webhook-parser";

// Evolution API webhook — one webhook URL per instance, so the [instance]
// path segment identifies the tenant.
//
// Auth note: Evolution does not include our global admin key in webhook
// requests, and there is no per-webhook signature scheme on the wire. We
// authenticate by mapping the path's instance name to a real User row;
// requests for unknown instances are silently dropped. The instance name
// itself contains the user id, which only Evolution + our DB know.
//
// Relevant events:
//   - CONNECTION_UPDATE: { event: "connection.update", data: { state: "open"|"close"|"connecting", ... } }
//   - MESSAGES_UPSERT:   { event: "messages.upsert", data: { key: { remoteJid, fromMe }, message: { conversation } } }

type EvolutionEvent = {
  event?: string;
  instance?: string;
  data?: {
    // CONNECTION_UPDATE
    state?: "open" | "close" | "connecting";
    // MESSAGES_UPSERT
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
    };
    pushName?: string;
  };
};

function extractMessageText(data: NonNullable<EvolutionEvent["data"]>): string | null {
  return (
    data.message?.conversation ??
    data.message?.extendedTextMessage?.text ??
    null
  );
}

function jidToPhone(jid: string | undefined): string | null {
  if (!jid) return null;
  const raw = jid.split("@")[0];
  if (!raw) return null;
  return raw.startsWith("+") ? raw : `+${raw}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instance: string }> },
) {
  try {
    const { instance } = await params;

    const body = (await request.json().catch(() => null)) as EvolutionEvent | null;
    if (!body) return NextResponse.json({ received: true });

    const user = await prisma.user.findUnique({
      where: { evolutionInstanceName: instance },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ received: true });

    const eventName = (body.event ?? "").toLowerCase().replace(/_/g, ".");
    const data = body.data ?? {};

    if (eventName === "connection.update") {
      const state = data.state;
      if (state === "open") {
        const ownerPhone = jidToPhone(data.key?.remoteJid) ?? null;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            whatsappStatus: "CONNECTED",
            whatsappConnectedAt: new Date(),
            ...(ownerPhone ? { whatsappPhoneNumber: ownerPhone } : {}),
          },
        });
      } else if (state === "close") {
        await prisma.user.update({
          where: { id: user.id },
          data: { whatsappStatus: "DISCONNECTED" },
        });
      } else if (state === "connecting") {
        await prisma.user.update({
          where: { id: user.id },
          data: { whatsappStatus: "CONNECTING" },
        });
      }
      return NextResponse.json({ received: true });
    }

    if (eventName !== "messages.upsert") {
      return NextResponse.json({ received: true });
    }

    if (data.key?.fromMe) return NextResponse.json({ received: true });

    const phone = jidToPhone(data.key?.remoteJid);
    const messageText = extractMessageText(data);
    if (!phone || !messageText) return NextResponse.json({ received: true });

    const responseType = parseResponse(messageText);
    if (!responseType) return NextResponse.json({ received: true });

    // Scoped to this tenant (user.id) — prevents cross-tenant collisions
    // when the same patient phone is registered under multiple users.
    const appointment = await prisma.appointment.findFirst({
      where: {
        userId: user.id,
        patient: { phone },
        status: "PENDING",
        confirmationSentAt: { not: null },
        dateTime: { gte: new Date() },
      },
      orderBy: { confirmationSentAt: "desc" },
    });

    if (!appointment) return NextResponse.json({ received: true });

    if (responseType === "CONFIRMED") {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
    } else if (responseType === "CANCELED") {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELED" },
      });
    }

    await prisma.messageLog.updateMany({
      where: { appointmentId: appointment.id },
      data: { response: messageText, respondedAt: new Date() },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error in Evolution webhook:", error);
    return NextResponse.json({ received: true });
  }
}
