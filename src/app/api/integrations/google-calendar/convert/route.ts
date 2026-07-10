import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  paywallResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import {
  canonicalizePhone,
  checkEntitlement,
  hashCpf,
  reserveSlotInTx,
  SlotConflictError,
} from "@/lib/billing";
import { canonicalizeCpf } from "@/lib/anti-fraud/cpf-validator";
import { createPatientSchema } from "@/lib/validations/patient";
import { findConflictingAppointment } from "@/lib/services/conflict";
import type { ApiResponse, AppointmentResponse } from "@/lib/types/api";

/**
 * POST /api/integrations/google-calendar/convert — "Promover" um evento do
 * Google Calendar a um Appointment gerenciado (Fase B, promoção manual).
 *
 * Fluxo: gate PREMIUM/e-mail (`gcal.convert`) → resolve paciente (existente por
 * id/telefone/CPF, ou cria novo passando pela quota) → cria Appointment PENDING
 * (mesma regra de conflito do POST /appointments) → grava `ExternalEvent` como
 * link idempotente (o firewall: o scheduler NUNCA lê ExternalEvent; o
 * Appointment gerado é um agendamento normal). Idempotente por evento
 * (`@@unique([userId, googleEventId])`).
 *
 * NÃO escreve nada no Google (promoção é sentido Google→app; embora o escopo
 * agora seja `calendar.events` read/write por causa do mirror da Fase C, este
 * fluxo é deliberadamente só de leitura). Depois de promovido, o `events` route
 * esconde o evento do overlay (de-dup por ExternalEvent). Cancelar o evento no
 * Google NÃO reflete no app (snapshot; sync contínuo é Fase B2).
 *
 * FIREWALL Fase C: rejeita promover um evento que NÓS criamos (espelho de um
 * Appointment) — senão criaria um segundo Appointment do próprio espelho (loop).
 */
const convertSchema = z
  .object({
    googleEventId: z.string().min(1),
    calendarId: z.string().default("primary"),
    dateTime: z.string().datetime("Data/hora inválida"),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    notes: z.string().max(2000).optional().nullable(),
    // Vincular a um paciente já existente...
    patientId: z.string().min(1).optional(),
    // ...ou criar/casar por dados (reusa a validação de paciente: nome + telefone +55).
    patient: createPatientSchema.optional(),
    // Snapshot do evento (contexto + de-dup no overlay).
    snapshot: z.object({
      title: z.string().max(500),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime().nullable().optional(),
      allDay: z.boolean().optional().default(false),
      googleStatus: z.string().max(50).nullable().optional(),
    }),
  })
  .refine((v) => Boolean(v.patientId) || Boolean(v.patient), {
    message: "Informe um paciente existente ou os dados (nome + telefone) para criar",
  });

const APP_INCLUDE = {
  patient: { select: { id: true, name: true, phone: true } },
  messageLogs: true,
} as const;

class QuotaExceededInTx extends Error {
  constructor(
    public current: number,
    public limit: number,
  ) {
    super("QUOTA_EXCEEDED");
  }
}

// Colisão de paciente existente (mesmo telefone/CPF) na criação durante a
// promoção → o usuário deve selecionar o paciente existente. Uma mensagem só,
// para os dois caminhos que a detectam (SlotConflictError e P2002 do Patient).
const patientCollisionResponse = (field: "CPF" | "telefone") =>
  badRequestResponse(`Já existe um paciente com esse ${field} — selecione-o para promover`);

export const POST = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    const userId = session.user.id;

    const body = await request.json().catch(() => null);
    const parsed = convertSchema.safeParse(body);
    if (!parsed.success) return badRequestResponse(parsed.error.issues[0].message);
    const input = parsed.data;

    // Gate PREMIUM + e-mail verificado (também cobre downgrade pós-connect).
    const gate = await checkEntitlement(userId, "gcal.convert");
    if (!gate.allowed) {
      return paywallResponse({ reason: gate.reason, upgrade: gate.upgrade });
    }

    // Devolve o agendamento de um evento JÁ promovido (idempotência sequencial
    // + recuperação de corrida). `appointmentId` nunca é nulo na prática (o FK é
    // onDelete: Cascade → a linha some junto com o Appointment).
    const alreadyPromotedResponse = async () => {
      const link = await prisma.externalEvent.findUnique({
        where: { userId_googleEventId: { userId, googleEventId: input.googleEventId } },
      });
      if (!link?.appointmentId) return null;
      const appointment = await prisma.appointment.findFirst({
        where: { id: link.appointmentId, userId },
        include: APP_INCLUDE,
      });
      if (!appointment) return null;
      return NextResponse.json<ApiResponse<{ appointment: AppointmentResponse; alreadyPromoted: true }>>({
        data: { appointment, alreadyPromoted: true },
        message: "Evento já promovido a agendamento",
      });
    };

    const existing = await alreadyPromotedResponse();
    if (existing) return existing;

    // Firewall Fase C: se o evento é um espelho que NÓS criamos (id gravado em
    // algum Appointment do tenant), promovê-lo criaria um Appointment duplicado
    // do próprio espelho (loop). O overlay já esconde esses eventos (drop por
    // tag + de-dup), mas uma chamada direta à API não passa pelo overlay.
    const appOrigin = await prisma.appointment.findFirst({
      where: { userId, googleEventId: input.googleEventId },
      select: { id: true },
    });
    if (appOrigin) {
      return badRequestResponse(
        "Esse evento foi criado pelo app a partir de um agendamento — ele já corresponde a um agendamento",
      );
    }

    // Rejeita passado — senão markNoShows marcaria NO_SHOW falso no próximo cron.
    const when = new Date(input.dateTime);
    if (Number.isNaN(when.getTime())) return badRequestResponse("Data/hora inválida");
    if (when < new Date()) {
      return badRequestResponse("Não é possível promover um evento no passado");
    }
    const duration = input.durationMinutes ?? 30;

    // Identificadores do paciente (quando criando/casando por dados).
    const cpfCanonical = input.patient?.cpf ? canonicalizeCpf(input.patient.cpf) : null;
    const cpfHash = cpfCanonical ? hashCpf(cpfCanonical) : null;
    const phone = input.patient?.phone ?? null;

    // Resolve o alvo (pré-tx): id explícito, ou match por telefone (unique) → CPF (unique).
    let targetPatientId: string | null = null;
    if (input.patientId) {
      const owned = await prisma.patient.findFirst({
        where: { id: input.patientId, userId },
        select: { id: true },
      });
      if (!owned) return badRequestResponse("Paciente não encontrado");
      targetPatientId = owned.id;
    } else {
      const byPhone = phone
        ? await prisma.patient.findUnique({
            where: { userId_phone: { userId, phone } },
            select: { id: true },
          })
        : null;
      const byCpf =
        !byPhone && cpfHash
          ? await prisma.patient.findUnique({
              where: { userId_cpfHash: { userId, cpfHash } },
              select: { id: true },
            })
          : null;
      targetPatientId = byPhone?.id ?? byCpf?.id ?? null;
    }

    const willCreate = targetPatientId === null;

    // Vai criar paciente novo → pré-gate de criação (CPF_REQUIRED no Free + QUOTA).
    if (willCreate) {
      if (!input.patient) {
        return badRequestResponse("Informe nome e telefone para criar o paciente");
      }
      const createGate = await checkEntitlement(userId, "patient.create", {
        identifier: { cpf: cpfCanonical, phone: input.patient.phone },
      });
      if (!createGate.allowed) {
        return paywallResponse({
          reason: createGate.reason,
          upgrade: createGate.upgrade,
          current: createGate.current,
          limit: createGate.limit,
        });
      }
    }

    // Conflito de horário — mesma regra (e mesma limitação) do POST /appointments:
    // é um guard SUAVE, feito FORA da tx, no cliente global. A tx Serializable
    // abaixo NÃO protege contra duplo-agendamento por corrida (dois /convert
    // simultâneos, eventos diferentes, mesmo horário → ambos passam aqui e criam
    // Appointments sobrepostos). Aceito por design (idem POST /appointments);
    // endurecer exigiria constraint de exclusão no DB, mudança app-wide.
    const conflict = await findConflictingAppointment({ userId, dateTime: when, durationMinutes: duration });
    if (conflict) {
      return badRequestResponse(`Conflito com agendamento de ${conflict.patient.name}`);
    }

    // Tx Serializable: (cria/vincula paciente) + cria Appointment + linka ExternalEvent.
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          let patientId = targetPatientId;
          let reused = false;

          if (patientId === null) {
            const p = input.patient!;
            const created = await tx.patient.create({
              data: {
                name: p.name,
                phone: p.phone,
                phoneCanonical: canonicalizePhone(p.phone),
                cpf: cpfCanonical,
                cpfHash,
                email: p.email ?? undefined,
                notes: p.notes ?? undefined,
                userId,
              },
              select: { id: true },
            });
            const reserve = await reserveSlotInTx(tx, userId, { cpf: cpfCanonical, phone: p.phone }, created.id);
            if (!reserve.ok) throw new QuotaExceededInTx(reserve.current, reserve.limit);
            reused = reserve.reused;
            patientId = created.id;
          }

          const appointment = await tx.appointment.create({
            data: {
              patientId: patientId,
              userId,
              dateTime: when,
              durationMinutes: duration,
              notes: input.notes ?? undefined,
            },
            include: APP_INCLUDE,
          });

          // `create` (não `upsert`): sob corrida promovendo o MESMO evento, o
          // conflito no unique vira P2002/P2034 (tratado no catch, devolvendo o
          // agendamento do vencedor) — evita o `DO UPDATE` do upsert re-apontar
          // o `appointmentId` e orfanar o Appointment já criado pelo outro request.
          await tx.externalEvent.create({
            data: {
              userId,
              googleEventId: input.googleEventId,
              calendarId: input.calendarId,
              title: input.snapshot.title,
              startsAt: new Date(input.snapshot.startsAt),
              endsAt: input.snapshot.endsAt ? new Date(input.snapshot.endsAt) : null,
              allDay: input.snapshot.allDay,
              googleStatus: input.snapshot.googleStatus ?? null,
              appointmentId: appointment.id,
            },
          });

          return { appointment, reused };
        },
        { isolationLevel: "Serializable" },
      );

      await audit({
        action: "gcal.promoted",
        tenantUserId: userId,
        entityType: "Appointment",
        entityId: result.appointment.id,
        metadata: {
          googleEventId: input.googleEventId,
          patientId: result.appointment.patient.id,
          created: willCreate,
          reused: result.reused,
        },
      });

      return NextResponse.json<ApiResponse<{ appointment: AppointmentResponse; created: boolean; reused: boolean }>>(
        {
          data: { appointment: result.appointment, created: willCreate, reused: result.reused },
          message: "Evento promovido a agendamento",
        },
        { status: 201 },
      );
    } catch (txError: unknown) {
      if (txError instanceof QuotaExceededInTx) {
        return paywallResponse({
          reason: "QUOTA_EXCEEDED",
          upgrade: "PRO",
          current: txError.current,
          limit: txError.limit,
        });
      }
      if (txError instanceof SlotConflictError) {
        return patientCollisionResponse(txError.identifierType === "CPF" ? "CPF" : "telefone");
      }
      const code = (txError as { code?: string }).code;
      // Corrida promovendo o MESMO evento: ANTES de qualquer mensagem de erro,
      // checa se o evento já está promovido (o vencedor criou o link) e devolve
      // o agendamento dele (idempotente). Isto cobre também o caso em que o
      // perdedor recriou o MESMO paciente novo e bateu no unique de Patient
      // (P2002 phone/cpf) ANTES de chegar no unique do ExternalEvent — sem esta
      // ordem, ele veria "paciente já existe" para um evento que, na verdade,
      // acabou de ser promovido pelo vencedor. Cobre P2002 (unique do evento OU
      // do paciente) e P2034/40001 (falha de serialização da tx Serializable).
      if (code === "P2002" || code === "P2034") {
        const raced = await alreadyPromotedResponse();
        if (raced) return raced;
      }
      const target = (txError as { meta?: { target?: string[] | string } }).meta?.target;
      const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "");
      // P2002 do Patient (telefone/CPF já cadastrado) e o evento NÃO está
      // promovido (o check acima não achou link) → é colisão real de paciente:
      // o usuário deve selecionar o existente para promover.
      if (code === "P2002" && (targetStr.includes("phone") || targetStr.includes("cpfHash"))) {
        return patientCollisionResponse(targetStr.includes("cpfHash") ? "CPF" : "telefone");
      }
      if (code === "P2002") return badRequestResponse("Evento já promovido");
      if (code === "P2034") {
        return badRequestResponse("Não foi possível promover agora (concorrência) — tente novamente");
      }
      throw txError;
    }
  } catch (error) {
    console.error("POST /api/integrations/google-calendar/convert error:", error);
    return serverErrorResponse();
  }
});
