import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  paywallResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { checkEntitlement } from "@/lib/billing";
import { fetchGoogleEventById } from "@/lib/services/google/calendar";
import { parseEventSignals, type EventSignals } from "@/lib/services/google/promote-signals";
import type { ApiResponse } from "@/lib/types/api";

/**
 * POST /api/integrations/google-calendar/event-signals — lê UM evento do Google
 * (events.get, com descrição + convidados) e devolve "sinais" já parseados
 * (nome/telefone/e-mail candidatos) para pré-preencher o diálogo de promoção.
 * Não devolve a descrição crua (evita vazar mais do que o necessário); privado
 * volta sem sinais de nome. Gate de LEITURA (`gcal.sync`); o submit da promoção
 * é gated por `gcal.convert` no /convert.
 */
const schema = z.object({ eventId: z.string().min(1) });

type SignalsResponse = { signals: EventSignals; isPrivate: boolean };

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    const userId = session.user.id;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return badRequestResponse(parsed.error.issues[0].message);

    const gate = await checkEntitlement(userId, "gcal.sync");
    if (!gate.allowed) return paywallResponse({ reason: gate.reason, upgrade: gate.upgrade });

    const result = await fetchGoogleEventById(userId, parsed.data.eventId);
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return badRequestResponse("Evento não encontrado no Google");
      // NOT_CONNECTED / NEEDS_RECONSENT / UPSTREAM_ERROR: sem sinais, sem quebrar
      // a UI — o diálogo cai no pré-preenchimento local (título do overlay).
      return NextResponse.json<ApiResponse<SignalsResponse>>({
        data: { signals: {}, isPrivate: false },
      });
    }

    const { event } = result;
    const signals = parseEventSignals({
      title: event.title,
      description: event.description,
      attendeeEmails: event.attendeeEmails,
    });

    return NextResponse.json<ApiResponse<SignalsResponse>>({
      data: { signals, isPrivate: event.isPrivate },
    });
  } catch (error) {
    console.error("POST /api/integrations/google-calendar/event-signals error:", error);
    return serverErrorResponse();
  }
}
