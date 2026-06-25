import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit, auditWrap } from "@/lib/audit"
import {
  createVerificationToken,
  sendVerificationEmail,
} from "@/lib/anti-fraud/email-verification"
import { captureError } from "@/lib/observability"
import type { ApiResponse } from "@/lib/types/api"

const bodySchema = z.object({ email: z.string().email() })

// Limite por IP — pega abuso ingênuo. NÃO é confiável sozinho: o IP vem do
// header X-Forwarded-For, que o atacante pode forjar a cada request.
const IP_WINDOW_MS = 10 * 60_000
const IP_MAX_PER_WINDOW = 3
// Limite por conta-alvo (userId) — esta é a defesa real contra inbox-bombing:
// o atacante NÃO controla o userId, então rotacionar XFF não ajuda. Protege a
// caixa de entrada da vítima e o custo/reputação do remetente (Resend).
const USER_WINDOW_MS = 60 * 60_000
const USER_MAX_PER_WINDOW = 3

function extractIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]?.trim() ?? null
  return req.headers.get("x-real-ip")
}

/**
 * Reenvia o e-mail de verificação para uma conta ainda não confirmada.
 *
 * Necessário porque o login passou a ser bloqueado até a confirmação (bug
 * report 2026-06-24) — sem reenvio, quem perdeu/não recebeu o e-mail ficaria
 * travado para sempre.
 *
 * - **Sempre responde 200** (anti-enumeration): não revela se o e-mail existe
 *   nem se já está confirmado.
 * - **Rate limit por IP** (3 / 10 min) pra não virar relay de spam — ao
 *   estourar, ainda responde 200 mas não envia.
 * - Em dev sem `RESEND_API_KEY`, o link aparece no console (ver
 *   `sendVerificationEmail`).
 */
export const POST = auditWrap(async (req: NextRequest) => {
  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ error: "Email inválido" }, { status: 400 })
  }

  const email = parsed.data.email
  const ip = extractIp(req)

  try {
    // Rate limit por IP (best-effort). Conta inclusive as tentativas "skipped",
    // o que efetivamente trava o IP pela janela após o limite.
    let ipLimited = false
    if (ip) {
      const recentByIp = await prisma.auditLog.count({
        where: {
          action: "auth.verification_resent",
          ipAddress: ip,
          createdAt: { gt: new Date(Date.now() - IP_WINDOW_MS) },
        },
      })
      ipLimited = recentByIp >= IP_MAX_PER_WINDOW
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, emailVerifiedAt: true, deletedAt: true },
    })

    // Só reenvia pra conta existente, não deletada e ainda não verificada.
    const eligible = !!user && !user.deletedAt && user.emailVerifiedAt === null

    // Rate limit por conta-alvo (anti inbox-bombing — robusto a XFF spoofing,
    // pois o userId não é controlável pelo atacante). Conta inclusive os
    // "skipped" desta conta, então após o limite a conta fica travada na janela.
    let userLimited = false
    if (eligible) {
      const recentByUser = await prisma.auditLog.count({
        where: {
          action: "auth.verification_resent",
          tenantUserId: user.id,
          createdAt: { gt: new Date(Date.now() - USER_WINDOW_MS) },
        },
      })
      userLimited = recentByUser >= USER_MAX_PER_WINDOW
    }

    if (eligible && !ipLimited && !userLimited) {
      const token = await createVerificationToken(user.id)
      const sent = await sendVerificationEmail({ to: user.email, name: user.name, token })
      await audit({
        action: "auth.verification_resent",
        tenantUserId: user.id,
        metadata: { email, emailSent: sent.ok, mode: sent.ok ? sent.mode : sent.reason },
      })
    } else {
      await audit({
        action: "auth.verification_resent",
        tenantUserId: user?.id ?? null,
        metadata: {
          email,
          skipped: true,
          reason: ipLimited
            ? "rate_limited_ip"
            : userLimited
              ? "rate_limited_user"
              : !user
                ? "user_not_found"
                : user.deletedAt
                  ? "deleted"
                  : "already_verified",
        },
      })
    }
  } catch (error) {
    // Não vaza erro pro cliente (anti-enumeration), mas reporta pra gente.
    await captureError(error, {
      area: "request",
      extra: { route: "/api/auth/resend-verification" },
    })
  }

  return NextResponse.json<ApiResponse>({
    message: "Se a conta existir e ainda não estiver confirmada, enviamos um novo link.",
  })
})
