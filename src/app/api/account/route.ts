import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import { getBillingProvider } from "@/lib/billing";
import { captureError } from "@/lib/observability";
import { decryptToken } from "@/lib/services/google/token-crypto";
import { revokeGoogleGrant } from "@/lib/services/google/revoke";
import type { ApiResponse } from "@/lib/types/api";

/**
 * DELETE /api/account — exclusão de conta (LGPD), SOFT delete:
 * - marca `User.deletedAt` (login + getAuthSession passam a rejeitar);
 * - ANONIMIZA a PII do dono (email→deleted-<id>@deleted.local libera o @unique,
 *   name/clinicName/cpf/cpfHash/whatsapp → genérico/null);
 * - cancela a assinatura no provider (best-effort) + marca local CANCELED;
 * - revoga + apaga a conexão Google (best-effort, APÓS o commit — ver abaixo);
 * - MANTÉM os dados dos pacientes; uma purga no cron os apaga após 30 dias.
 * Os campos de consentimento (termsAcceptedAt etc.) são preservados (prova legal).
 */
export const DELETE = auditWrap(async (_request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    const userId = session.user.id;

    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (sub?.providerSubscriptionId) {
      // Para a cobrança recorrente no gateway (best-effort — não trava o delete).
      try {
        await getBillingProvider().cancelSubscription(sub.providerSubscriptionId);
      } catch (err) {
        await captureError(err, {
          area: "request",
          tenantUserId: userId,
          extra: { route: "account/delete/provider", providerSubscriptionId: sub.providerSubscriptionId },
        });
      }
    }

    const already = await prisma.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
    if (already?.deletedAt) return badRequestResponse("Conta já foi excluída.");

    await prisma.$transaction(async (tx) => {
      // updateMany + guard deletedAt:null = idempotente sob duplo-submit concorrente
      // (não re-carimba deletedAt nem reestende a janela de purga).
      await tx.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: {
          deletedAt: new Date(),
          // Anonimiza PII do dono (mantém termsAcceptedAt/version como prova legal).
          email: `deleted-${userId}@deleted.local`,
          name: "Conta removida",
          clinicName: "Conta removida",
          cpf: null,
          cpfHash: null,
          whatsappPhoneNumber: null,
          lastQrcodeBase64: null,
        },
      });
      if (sub) {
        await tx.subscription.update({
          where: { userId },
          data: {
            status: "CANCELED",
            cancelAtPeriodEnd: true,
            provider: null,
            providerCustomerId: null,
            providerSubscriptionId: null,
          },
        });
      }
    });

    await audit({
      action: "account.deleted",
      tenantUserId: userId,
      entityType: "User",
      entityId: userId,
      metadata: { hadSubscription: !!sub, plan: sub?.plan ?? null },
    });

    // LGPD — teardown do Google: o refresh token é um grant vivo à agenda de uma
    // pessoa. Feito DEPOIS do commit do soft-delete (revoke é irreversível — não
    // pode rodar antes de uma tx que pode dar rollback) e ISOLADO em try/catch
    // (falha aqui, inclusive tabela ausente, nunca quebra a exclusão, que é a
    // operação crítica). Se o revoke FALHAR, mantém a conexão para a purga 30d
    // retentar — senão o grant ficaria vivo sem token para novo revoke.
    // Ver .context/features/google-calendar.md § LGPD.
    try {
      const gcal = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
      if (gcal) {
        const revoked = await revokeGoogleGrant(decryptToken(gcal.refreshTokenEnc));
        if (revoked) {
          await prisma.googleCalendarConnection.delete({ where: { userId } });
        } else {
          await captureError(new Error("gcal revoke falhou no delete de conta"), {
            area: "request",
            tenantUserId: userId,
            extra: { route: "account/delete/gcal-revoke", retriedBy: "purge" },
          });
        }
      }
    } catch (err) {
      await captureError(err, {
        area: "request",
        tenantUserId: userId,
        extra: { route: "account/delete/gcal-teardown" },
      });
    }

    return NextResponse.json<ApiResponse<{ deleted: true }>>({
      data: { deleted: true },
      message: "Conta excluída. Seus dados de pacientes serão apagados em até 30 dias.",
    });
  } catch (error) {
    console.error("account DELETE error:", error);
    return serverErrorResponse();
  }
});
