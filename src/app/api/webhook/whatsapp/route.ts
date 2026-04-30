import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseResponse } from "@/lib/services/webhook-parser";

// WAHA webhook payload (event=message):
// {
//   event: "message",
//   session: "default",
//   payload: {
//     id: "false_5511...@c.us_AAA",
//     from: "5511999999999@c.us",
//     fromMe: false,
//     body: "Sim",
//     hasMedia: false,
//     timestamp: 1700000000,
//     ...
//   }
// }
//
// Auth: WAHA optionally signs the request via X-Api-Key (we require it).

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key") || request.headers.get("apikey");
    const expected = process.env.WAHA_API_KEY;
    if (!expected || !apiKey || apiKey !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ received: true });

    // Only process inbound text messages.
    if (body.event && body.event !== "message") {
      return NextResponse.json({ received: true });
    }
    const payload = body.payload ?? body;
    if (payload?.fromMe) return NextResponse.json({ received: true });

    const from: string | undefined = payload?.from;
    const messageText: string | undefined = payload?.body;
    if (!from || !messageText) return NextResponse.json({ received: true });

    // "5511999999999@c.us" -> "+5511999999999"
    const rawPhone = from.split("@")[0];
    if (!rawPhone) return NextResponse.json({ received: true });
    const phone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;

    const responseType = parseResponse(messageText);
    if (!responseType) return NextResponse.json({ received: true });

    const appointment = await prisma.appointment.findFirst({
      where: {
        patient: { phone },
        status: "PENDING",
        confirmationSentAt: { not: null },
        dateTime: { gte: new Date() },
      },
      orderBy: { confirmationSentAt: "desc" },
      include: { patient: true },
    });

    if (!appointment || appointment.userId !== appointment.patient.userId) {
      return NextResponse.json({ received: true });
    }

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
    console.error("Error in WAHA webhook:", error);
    return NextResponse.json({ received: true });
  }
}
