import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit, auditWrap } from "@/lib/audit"
import { makeResetToken, sendPasswordResetEmail } from "@/lib/anti-fraud/password-reset"
import { captureError } from "@/lib/observability"
import type { ApiResponse } from "@/lib/types/api"

const bodySchema = z.object({ email: z.string().email() })

/**
 * Pede reset de senha (Sprint 10 / fatia 2 — antes era stub que não enviava).
 *
 * - Gera token assinado stateless (ver password-reset.ts) e envia o link.
 * - **Sempre responde 200** (anti-enumeration): não revela se o email existe.
 * - Falha no envio do email é logada/auditada mas não vaza pro cliente.
 */
export const POST = auditWrap(async (req: NextRequest) => {
  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ error: "Email inválido" }, { status: 400 })
  }

  const email = parsed.data.email
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, password: true },
    })

    if (user) {
      const token = makeResetToken(user.id, user.password)
      const sent = await sendPasswordResetEmail({ to: user.email, name: user.name, token })
      await audit({
        action: "auth.password_reset_requested",
        tenantUserId: user.id,
        metadata: { email, emailSent: sent.ok, mode: sent.ok ? sent.mode : sent.reason },
      })
    } else {
      await audit({
        action: "auth.password_reset_requested",
        metadata: { email, userFound: false },
      })
    }
  } catch (error) {
    // Não vaza erro pro cliente (anti-enumeration), mas reporta pra gente.
    await captureError(error, { area: "request", extra: { route: "/api/auth/forgot-password" } })
  }

  return NextResponse.json<ApiResponse>({
    message: "Se o email existir, um link foi enviado.",
  })
})
