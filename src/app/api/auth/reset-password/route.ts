import { NextRequest, NextResponse } from "next/server"
import * as bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { audit, auditWrap } from "@/lib/audit"
import { resetPasswordSchema } from "@/lib/validations/auth"
import { verifyResetToken } from "@/lib/anti-fraud/password-reset"
import { captureError } from "@/lib/observability"
import type { ApiResponse } from "@/lib/types/api"

/**
 * Conclui o reset de senha (Sprint 10 / fatia 2).
 * Verifica o token assinado, troca a senha (bcrypt). Trocar a senha
 * invalida o próprio token automaticamente (binding no hash) = single-use.
 */
export const POST = auditWrap(async (req: NextRequest) => {
  try {
    const json = await req.json().catch(() => null)
    const parsed = resetPasswordSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { error: "Dados inválidos", message: parsed.error.issues[0].message },
        { status: 400 },
      )
    }

    const result = await verifyResetToken(parsed.data.token)
    if (!result.ok) {
      await audit({
        action: "auth.password_reset_failed",
        metadata: { reason: result.reason },
      })
      const message =
        result.reason === "EXPIRED"
          ? "Esse link expirou. Peça um novo."
          : "Link inválido ou já utilizado. Peça um novo."
      return NextResponse.json<ApiResponse>({ error: message }, { status: 400 })
    }

    const hashed = await bcrypt.hash(parsed.data.password, 10)
    await prisma.user.update({
      where: { id: result.userId },
      data: { password: hashed },
    })

    await audit({
      action: "auth.password_reset_completed",
      tenantUserId: result.userId,
      entityType: "User",
      entityId: result.userId,
    })

    return NextResponse.json<ApiResponse>({ message: "Senha redefinida com sucesso." })
  } catch (error) {
    await captureError(error, { area: "request", extra: { route: "/api/auth/reset-password" } })
    return NextResponse.json<ApiResponse>({ error: "Erro ao redefinir senha" }, { status: 500 })
  }
})
