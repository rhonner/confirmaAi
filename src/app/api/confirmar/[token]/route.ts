import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { verifyConfirmationToken } from "@/lib/services/confirmation-token";

/**
 * Ação pública de confirmação/cancelamento pelo LINK do paciente (Feature
 * "Confirmação por link"). SEM sessão — o token assinado é a autorização.
 *
 * Segurança:
 * - A MUTAÇÃO só acontece aqui (POST). O GET da página é só leitura, então o
 *   pré-carregamento de link do WhatsApp/scanner NÃO dispara a ação.
 * - Uso único pelo ESTADO: só age se `status === PENDING`. Já confirmado/
 *   cancelado → devolve o status atual sem mexer (link trava).
 * - `dateTime > now`: não dá pra confirmar/cancelar consulta que já virou.
 */

const bodySchema = z.object({ action: z.enum(["CONFIRM", "CANCEL"]) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  }
  const { action } = parsed.data;

  const verified = verifyConfirmationToken(token);
  if (!verified.ok) {
    // EXPIRED (passou do prazo) vs INVALID/MALFORMED (adulterado/inexistente).
    const status = verified.reason === "EXPIRED" ? 410 : 400;
    return NextResponse.json({ error: verified.reason }, { status });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: verified.appointmentId },
    select: { id: true, status: true, dateTime: true, userId: true },
  });
  if (!appointment) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Estado terminal → não age; devolve o status atual (o link "trava").
  if (appointment.status !== "PENDING") {
    return NextResponse.json({
      data: { status: appointment.status, alreadyResolved: true },
    });
  }

  // Já passou do horário → tarde demais (o cron pode até já ter marcado NO_SHOW).
  if (appointment.dateTime.getTime() <= Date.now()) {
    return NextResponse.json({ error: "TOO_LATE" }, { status: 409 });
  }

  const newStatus = action === "CONFIRM" ? "CONFIRMED" : "CANCELED";
  await prisma.appointment.update({
    where: { id: appointment.id },
    data:
      action === "CONFIRM"
        ? { status: "CONFIRMED", confirmedAt: new Date() }
        : { status: "CANCELED" },
  });

  await audit({
    action:
      action === "CONFIRM"
        ? "appointment.confirmed_by_patient"
        : "appointment.canceled_by_patient",
    entityType: "Appointment",
    entityId: appointment.id,
    tenantUserId: appointment.userId,
    metadata: { via: "link" },
  });

  return NextResponse.json({ data: { status: newStatus } });
}
