import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseResponse } from "@/lib/services/webhook-parser";
import {
  findPendingAppointmentForResponse,
  buildConfirmationAck,
} from "@/lib/services/webhook-confirmation";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { audit, maskPhone, truncateMessage, withFixedActor } from "@/lib/audit";
import {
  markWhatsappDisconnected,
  whatsappReconnectedPatch,
} from "@/lib/services/whatsapp-alerts";

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
    // QRCODE_UPDATED — Evolution v2 envia QR async via webhook
    qrcode?: { base64?: string; code?: string; count?: number };
    // Em alguns formatos o QR vem direto em data
    base64?: string;
  };
  qrcode?: { base64?: string };
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

// O ack ao paciente é best-effort: bound o envio para que uma Evolution lenta
// não segure a resposta do webhook (resposta lenta → Evolution reentrega o
// evento → reprocessamento da mesma resposta).
const ACK_SEND_TIMEOUT_MS = 8000;

export const POST = withFixedActor(
  { actorType: "WEBHOOK", actorId: "evolution" },
  async (
    request: NextRequest,
    { params }: { params: Promise<{ instance: string }> },
  ) => {
  try {
    const { instance } = await params;

    // Shared secret opcional. Se EVOLUTION_WEBHOOK_SECRET estiver setada,
    // exige header `x-evolution-secret` ou `apikey` igual. Sem isso, qualquer
    // um que descubra o instanceName pode forjar eventos.
    const expectedSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (expectedSecret) {
      const got = request.headers.get("x-evolution-secret") ?? request.headers.get("apikey");
      if (got !== expectedSecret) {
        await audit({
          action: "webhook.evolution.invalid_secret",
          metadata: { instance, hasHeader: !!got },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await request.json().catch(() => null)) as EvolutionEvent | null;
    if (!body) return NextResponse.json({ received: true });

    const user = await prisma.user.findUnique({
      where: { evolutionInstanceName: instance },
      select: { id: true, whatsappStatus: true },
    });
    if (!user) return NextResponse.json({ received: true });

    // Aceita tanto SCREAMING_SNAKE quanto camelCase ("QRCODE_UPDATED",
    // "qrcode.updated", "qrcodeUpdated") — Evolution varia entre versões.
    const eventName = (body.event ?? "")
      .replace(/([a-z])([A-Z])/g, "$1.$2")
      .toLowerCase()
      .replace(/_/g, ".");
    const data = body.data ?? {};

    if (eventName === "qrcode.updated") {
      const base64 =
        data.qrcode?.base64 ?? data.base64 ?? body.qrcode?.base64 ?? null;
      if (base64) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastQrcodeBase64: base64,
            lastQrcodeAt: new Date(),
            whatsappStatus: "CONNECTING",
          },
        });
      }
      return NextResponse.json({ received: true });
    }

    if (eventName === "connection.update") {
      const state = data.state;
      if (state === "open") {
        const ownerPhone = jidToPhone(data.key?.remoteJid) ?? null;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            whatsappStatus: "CONNECTED",
            whatsappConnectedAt: new Date(),
            lastQrcodeBase64: null,
            lastQrcodeAt: null,
            ...whatsappReconnectedPatch(),
            ...(ownerPhone ? { whatsappPhoneNumber: ownerPhone } : {}),
          },
        });
      } else if (state === "close") {
        const wasConnected = user.whatsappStatus === "CONNECTED";
        await prisma.user.update({
          where: { id: user.id },
          data: { whatsappStatus: "DISCONNECTED" },
        });
        // Sprint 8: só na TRANSIÇÃO (CONNECTED → close) — eventos "close"
        // repetidos ou durante pareamento inicial não disparam alerta.
        if (wasConnected) {
          await markWhatsappDisconnected(user.id, "webhook");
        }
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

    // Casamento FIFO scoped por tenant (multi-tenancy + nono dígito tratados
    // no helper). Com vários agendamentos pendentes, cada resposta afeta a
    // confirmação mais antiga ainda em aberto — a ordem que o paciente lê.
    const appointment = await findPendingAppointmentForResponse(user.id, phone);

    if (!appointment) return NextResponse.json({ received: true });

    // Status + anexo da resposta ao log: writes independentes, em paralelo.
    await Promise.all([
      prisma.appointment.update({
        where: { id: appointment.id },
        data:
          responseType === "CONFIRMED"
            ? { status: "CONFIRMED", confirmedAt: new Date() }
            : { status: "CANCELED" },
      }),
      prisma.messageLog.updateMany({
        where: { appointmentId: appointment.id },
        data: { response: messageText, respondedAt: new Date() },
      }),
    ]);

    // Audit ANTES de qualquer chamada de rede de saída — a trilha não pode ser
    // perdida se a Evolution travar no envio do ack.
    await audit({
      action:
        responseType === "CONFIRMED"
          ? "appointment.confirmed_by_patient"
          : "appointment.canceled_by_patient",
      entityType: "Appointment",
      entityId: appointment.id,
      tenantUserId: user.id,
      metadata: {
        phone: maskPhone(phone),
        messageText: truncateMessage(messageText),
      },
    });

    // Ack de volta ao paciente, nomeando o agendamento (transparência — ver
    // helper). `instance` é o evolutionInstanceName do tenant. Best-effort e
    // com timeout: não conta na cota e não pode segurar a resposta do webhook.
    await sendWhatsAppMessage(
      instance,
      phone,
      buildConfirmationAck(responseType, appointment.dateTime),
      ACK_SEND_TIMEOUT_MS,
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error in Evolution webhook:", error);
    return NextResponse.json({ received: true });
  }
  },
)
