import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import { check } from "@/lib/billing/entitlements";
import { hasWriteScope } from "./oauth";
import {
  appOriginEventId,
  createGoogleEvent,
  deleteGoogleEvent,
  patchGoogleEvent,
  type AppointmentEventInput,
} from "./calendar";
import type { AppointmentStatus } from "@/generated/prisma/client";

/**
 * Fase C — espelhamento app → Google Calendar. Um Appointment criado/editado/
 * cancelado no ConfirmaAí é replicado como evento no Google Calendar do tenant.
 *
 * Contrato (chamado via `after()` das rotas, pós-resposta): NUNCA lança, sempre
 * best-effort — uma falha do Google jamais quebra a criação/edição do
 * Appointment (que é a fonte da verdade; o Google é só um espelho de saída).
 *
 * FIREWALL nos dois sentidos: agendamentos promovidos DO Google (que têm um
 * `ExternalEvent` vinculado) são IGNORADOS aqui — nunca reescrevemos/apagamos o
 * evento original que o usuário criou no Google. Só espelhamos agendamentos
 * nativos do app. Ver .context/features/google-calendar.md § Fase C.
 */

// Ativação: "ligado automaticamente ao conectar" (decisão do dono, 2026-07-10)
// — sem toggle. O gate é: conexão CONNECTED com escopo de escrita + plano.
const APPT_SELECT = {
  id: true,
  userId: true,
  dateTime: true,
  durationMinutes: true,
  status: true,
  notes: true,
  googleEventId: true,
  patient: { select: { name: true } },
  externalEvent: { select: { id: true } },
} as const;

// Cancelado/no-show → apaga o evento no Google (decisão do dono: "apagar").
// NOT_CONFIRMED NÃO apaga (o horário ainda existe, só não confirmou).
const DELETE_ON_STATUS: AppointmentStatus[] = ["CANCELED", "NO_SHOW"];

type ApptRow = {
  id: string;
  userId: string;
  dateTime: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string | null;
  googleEventId: string | null;
  patient: { name: string } | null;
  externalEvent: { id: string } | null;
};

function eventInputFrom(appt: ApptRow): AppointmentEventInput {
  return {
    appointmentId: appt.id,
    userId: appt.userId,
    // O paciente sempre existe (FK obrigatória); fallback defensivo.
    summary: appt.patient?.name?.trim() || "Agendamento",
    description: appt.notes ?? null,
    start: appt.dateTime,
    durationMinutes: appt.durationMinutes,
  };
}

/**
 * Fast-exit para o caso comum (99%: FREE/PRO sem Google conectado). Faz UMA
 * query numa tabela pequena e sai antes de tocar o gate de plano ou o Google.
 * Só segue quando há conexão CONNECTED com escopo de escrita E o plano permite.
 */
async function mirroringEnabled(userId: string): Promise<boolean> {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId },
    select: { status: true, scopes: true },
  });
  if (!conn || conn.status !== "CONNECTED" || !hasWriteScope(conn.scopes)) return false;
  const gate = await check(userId, "gcal.push");
  return gate.allowed;
}

async function persistEventId(appointmentId: string, userId: string, eventId: string): Promise<void> {
  // updateMany (não update): não lança se a linha sumiu (delete concorrente).
  // googleCalendarId é rótulo informativo; a escrita real usa conn.calendarId.
  await prisma.appointment.updateMany({
    where: { id: appointmentId, userId },
    data: { googleEventId: eventId, googleCalendarId: "primary" },
  });
}

async function clearEventId(appointmentId: string, userId: string): Promise<void> {
  await prisma.appointment.updateMany({
    where: { id: appointmentId, userId },
    data: { googleEventId: null },
  });
}

async function auditPushed(
  userId: string,
  appointmentId: string,
  op: "created" | "updated" | "deleted",
  googleEventId: string | null,
): Promise<void> {
  try {
    await audit({
      action: "gcal.pushed",
      tenantUserId: userId,
      entityType: "Appointment",
      entityId: appointmentId,
      metadata: { op, googleEventId },
    });
  } catch {
    // Best-effort: auditoria nunca pode derrubar o mirror.
  }
}

async function safeCapture(err: unknown, userId: string, route: string): Promise<void> {
  try {
    await captureError(err, { area: "request", tenantUserId: userId, extra: { route } });
  } catch {
    /* noop */
  }
}

/** Criou um Appointment no app → cria o evento espelho no Google (idempotente). */
export async function syncAppointmentCreate(userId: string, appointmentId: string): Promise<void> {
  try {
    if (!(await mirroringEnabled(userId))) return;
    const appt = (await prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
      select: APPT_SELECT,
    })) as ApptRow | null;
    if (!appt) return;
    if (appt.externalEvent) return; // promovido DO Google — não espelhar de volta
    if (appt.googleEventId) return; // já espelhado
    if (DELETE_ON_STATUS.includes(appt.status)) return; // nasceu cancelado — nada a criar

    const result = await createGoogleEvent(userId, eventInputFrom(appt));
    if (result.ok && result.eventId) {
      await persistEventId(appointmentId, userId, result.eventId);
      await auditPushed(userId, appointmentId, "created", result.eventId);
    }
  } catch (err) {
    await safeCapture(err, userId, "mirror.create");
  }
}

/** Editou um Appointment → patch (ou delete se virou cancelado/no-show; ou cria se ainda não espelhado). */
export async function syncAppointmentUpdate(userId: string, appointmentId: string): Promise<void> {
  try {
    if (!(await mirroringEnabled(userId))) return;
    const appt = (await prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
      select: APPT_SELECT,
    })) as ApptRow | null;
    if (!appt) return;
    if (appt.externalEvent) return; // promovido DO Google — não tocar o evento do usuário

    if (DELETE_ON_STATUS.includes(appt.status)) {
      const eid = appt.googleEventId ?? appOriginEventId(appt.id);
      const del = await deleteGoogleEvent(userId, eid);
      if (del.ok && appt.googleEventId) {
        await clearEventId(appointmentId, userId);
        await auditPushed(userId, appointmentId, "deleted", eid);
      }
      return;
    }

    if (appt.googleEventId) {
      await patchGoogleEvent(userId, appt.googleEventId, eventInputFrom(appt));
      return;
    }

    // Sem espelho ainda (criado antes de conectar/escopo, ou create falhou) →
    // cria agora (backfill preguiçoso; id determinístico evita duplicar).
    const result = await createGoogleEvent(userId, eventInputFrom(appt));
    if (result.ok && result.eventId) {
      await persistEventId(appointmentId, userId, result.eventId);
      await auditPushed(userId, appointmentId, "created", result.eventId);
    }
  } catch (err) {
    await safeCapture(err, userId, "mirror.update");
  }
}

/**
 * Excluiu um Appointment (hard delete) → apaga o evento espelho. Recebe os
 * dados lidos ANTES do delete (a linha já não existe). `hadExternalEvent`
 * (promovido DO Google) → não apaga o evento original do usuário.
 */
export async function syncAppointmentDelete(
  userId: string,
  args: { appointmentId: string; googleEventId: string | null; hadExternalEvent: boolean },
): Promise<void> {
  try {
    if (args.hadExternalEvent) return;
    if (!(await mirroringEnabled(userId))) return;
    const eid = args.googleEventId ?? appOriginEventId(args.appointmentId);
    const del = await deleteGoogleEvent(userId, eid);
    if (del.ok && args.googleEventId) {
      await auditPushed(userId, args.appointmentId, "deleted", eid);
    }
  } catch (err) {
    await safeCapture(err, userId, "mirror.delete");
  }
}

/**
 * Renomeou um paciente → atualiza o summary dos eventos espelho dele. O summary
 * deriva de patient.name, mas o mirror só dispara pelas rotas de Appointment —
 * editar só o paciente deixaria o título velho no Google até a próxima edição do
 * agendamento. Cobre só agendamentos FUTUROS, já espelhados, ativos e nativos
 * (limita quota; ignora cancelados/no-show e promovidos DO Google).
 */
export async function syncPatientRename(userId: string, patientId: string): Promise<void> {
  try {
    if (!(await mirroringEnabled(userId))) return;
    const appts = (await prisma.appointment.findMany({
      where: {
        userId,
        patientId,
        googleEventId: { not: null },
        dateTime: { gte: new Date() },
        status: { notIn: DELETE_ON_STATUS },
      },
      select: APPT_SELECT,
      take: 200,
    })) as ApptRow[];
    for (const appt of appts) {
      if (appt.externalEvent) continue; // promovido DO Google — não tocar
      if (!appt.googleEventId) continue;
      await patchGoogleEvent(userId, appt.googleEventId, eventInputFrom(appt));
    }
  } catch (err) {
    await safeCapture(err, userId, "mirror.patientRename");
  }
}

// ── Horário bloqueado (TimeBlock) ──────────────────────────────────────────
// Um bloqueio é espelhado como um evento SEM convidados (summary = título) no
// Google Calendar do tenant. Reaproveita as MESMAS primitivas do Appointment
// (id determinístico via appOriginEventId + tag confirmaaiOrigin=app → nunca
// reaparece no overlay). O bloqueio NÃO tem status/paciente/ExternalEvent, então
// a máquina de estados é mais simples: criar/patch/apagar. Ver time-blocks.md.

const BLOCK_SELECT = {
  id: true,
  userId: true,
  dateTime: true,
  durationMinutes: true,
  title: true,
  googleEventId: true,
} as const;

type BlockRow = {
  id: string;
  userId: string;
  dateTime: Date;
  durationMinutes: number;
  title: string;
  googleEventId: string | null;
};

function blockEventInput(block: BlockRow): AppointmentEventInput {
  return {
    appointmentId: block.id, // usado só p/ o id determinístico + extendedProperties
    userId: block.userId,
    summary: block.title?.trim() || "Bloqueado",
    description: null, // bloqueio não tem observações
    start: block.dateTime,
    durationMinutes: block.durationMinutes,
  };
}

async function persistBlockEventId(blockId: string, userId: string, eventId: string): Promise<void> {
  await prisma.timeBlock.updateMany({
    where: { id: blockId, userId },
    data: { googleEventId: eventId, googleCalendarId: "primary" },
  });
}

async function auditBlockPushed(
  userId: string,
  blockId: string,
  op: "created" | "updated" | "deleted",
  googleEventId: string | null,
): Promise<void> {
  try {
    await audit({
      action: "gcal.pushed",
      tenantUserId: userId,
      entityType: "TimeBlock",
      entityId: blockId,
      metadata: { op, googleEventId },
    });
  } catch {
    // Best-effort.
  }
}

/** Criou um bloqueio → cria o evento espelho no Google (idempotente). */
export async function syncTimeBlockCreate(userId: string, blockId: string): Promise<void> {
  try {
    if (!(await mirroringEnabled(userId))) return;
    const block = (await prisma.timeBlock.findFirst({
      where: { id: blockId, userId },
      select: BLOCK_SELECT,
    })) as BlockRow | null;
    if (!block) return;
    if (block.googleEventId) return; // já espelhado
    const result = await createGoogleEvent(userId, blockEventInput(block));
    if (result.ok && result.eventId) {
      await persistBlockEventId(blockId, userId, result.eventId);
      await auditBlockPushed(userId, blockId, "created", result.eventId);
    }
  } catch (err) {
    await safeCapture(err, userId, "mirror.block.create");
  }
}

/** Editou um bloqueio → patch (ou cria se ainda não espelhado). */
export async function syncTimeBlockUpdate(userId: string, blockId: string): Promise<void> {
  try {
    if (!(await mirroringEnabled(userId))) return;
    const block = (await prisma.timeBlock.findFirst({
      where: { id: blockId, userId },
      select: BLOCK_SELECT,
    })) as BlockRow | null;
    if (!block) return;
    if (block.googleEventId) {
      await patchGoogleEvent(userId, block.googleEventId, blockEventInput(block));
      return;
    }
    const result = await createGoogleEvent(userId, blockEventInput(block));
    if (result.ok && result.eventId) {
      await persistBlockEventId(blockId, userId, result.eventId);
      await auditBlockPushed(userId, blockId, "created", result.eventId);
    }
  } catch (err) {
    await safeCapture(err, userId, "mirror.block.update");
  }
}

/**
 * Excluiu um bloqueio → apaga o evento espelho. Recebe o `googleEventId` lido
 * ANTES do delete (a linha já não existe). Fallback ao id determinístico caso o
 * espelho tenha sido criado mas a persistência do id tenha falhado.
 */
export async function syncTimeBlockDelete(
  userId: string,
  args: { blockId: string; googleEventId: string | null },
): Promise<void> {
  try {
    if (!(await mirroringEnabled(userId))) return;
    const eid = args.googleEventId ?? appOriginEventId(args.blockId);
    const del = await deleteGoogleEvent(userId, eid);
    if (del.ok && args.googleEventId) {
      await auditBlockPushed(userId, args.blockId, "deleted", eid);
    }
  } catch (err) {
    await safeCapture(err, userId, "mirror.block.delete");
  }
}
