import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
  paywallResponse,
} from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { check } from "@/lib/billing/entitlements";
import { fetchGoogleEventsForUser, type GcalEventDTO } from "@/lib/services/google/calendar";
import { startOfDayInAppTz, endOfDayInAppTz } from "@/lib/timezone";
import type { ApiResponse } from "@/lib/types/api";

const MAX_RANGE_DAYS = 62;

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate deve ser yyyy-MM-dd"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate deve ser yyyy-MM-dd"),
});

type GcalEventsResponse = {
  connected: boolean;
  /** Grant revogado/expirado — o card em /configuracoes pede reconexão. */
  needsReconsent?: boolean;
  /** Google indisponível agora (erro transitório) — overlay degrada em silêncio. */
  degraded?: boolean;
  /** Janela tinha mais eventos que o teto por requisição (250). */
  truncated?: boolean;
  events: GcalEventDTO[];
};

/**
 * GET /api/integrations/google-calendar/events?startDate&endDate — live-fetch
 * dos eventos do Google para o overlay somente-leitura da agenda (Fase A).
 * Datas `yyyy-MM-dd` são tratadas como dia LOCAL completo (America/Sao_Paulo),
 * mesma convenção de GET /api/appointments — os blocos alinham na mesma grade.
 * Gate PREMIUM (`gcal.sync`) server-side.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    const userId = session.user.id;

    const parsed = querySchema.safeParse({
      startDate: request.nextUrl.searchParams.get("startDate"),
      endDate: request.nextUrl.searchParams.get("endDate"),
    });
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message ?? "Parâmetros inválidos");
    }
    const timeMin = startOfDayInAppTz(parsed.data.startDate);
    const timeMax = endOfDayInAppTz(parsed.data.endDate);
    // O regex aceita datas não-calendário ("2026-13-40") → Invalid Date, e
    // comparações com NaN são sempre false (burlaria os guards abaixo).
    if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime())) {
      return badRequestResponse("Data inválida");
    }
    if (timeMin > timeMax) {
      return badRequestResponse("startDate deve ser anterior a endDate");
    }
    if (timeMax.getTime() - timeMin.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return badRequestResponse(`Intervalo máximo de ${MAX_RANGE_DAYS} dias`);
    }

    const decision = await check(userId, "gcal.sync");
    if (!decision.allowed) return paywallResponse(decision);

    const result = await fetchGoogleEventsForUser(userId, { timeMin, timeMax });

    if (result.ok) {
      // De-dup nos DOIS sentidos: esconde do overlay tanto os eventos JÁ
      // promovidos a agendamento (Fase B, Google→app) quanto os que NÓS criamos
      // espelhando um agendamento (Fase C, app→Google) — senão o dia mostraria
      // o bloco Google E o Appointment, e o nosso próprio espelho seria
      // "promovível" (loop → duplicata). O de-dup Fase C é backstop do drop por
      // tag em mapGoogleEvent (cobre o caso raro de a tag não ter sido gravada).
      let events = result.events;
      if (events.length) {
        const eventIds = events.map((e) => e.id);
        const [promoted, appMirrored] = await Promise.all([
          prisma.externalEvent.findMany({
            where: { userId, googleEventId: { in: eventIds }, appointmentId: { not: null } },
            select: { googleEventId: true },
          }),
          prisma.appointment.findMany({
            where: { userId, googleEventId: { in: eventIds } },
            select: { googleEventId: true },
          }),
        ]);
        const promotedIds = new Set<string>([
          ...promoted.map((p) => p.googleEventId),
          ...appMirrored.map((a) => a.googleEventId).filter((id): id is string => id !== null),
        ]);
        if (promotedIds.size) {
          events = events.filter((e) => !promotedIds.has(e.id));
        }
      }
      return NextResponse.json<ApiResponse<GcalEventsResponse>>({
        data: {
          connected: true,
          events,
          ...(result.truncated ? { truncated: true } : {}),
        },
      });
    }
    if (result.reason === "NEEDS_RECONSENT") {
      return NextResponse.json<ApiResponse<GcalEventsResponse>>({
        data: { connected: false, needsReconsent: true, events: [] },
      });
    }
    if (result.reason === "UPSTREAM_ERROR") {
      return NextResponse.json<ApiResponse<GcalEventsResponse>>({
        data: { connected: true, degraded: true, events: [] },
      });
    }
    return NextResponse.json<ApiResponse<GcalEventsResponse>>({
      data: { connected: false, events: [] },
    });
  } catch (error) {
    console.error("GET /api/integrations/google-calendar/events error:", error);
    return serverErrorResponse();
  }
}
